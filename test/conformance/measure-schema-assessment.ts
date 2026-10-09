import {createHash} from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import {prepareResolvedCompilationInput} from '../../src/compiler/semanticCatalog.js';
import {analyzeOccurrences} from '../../src/compiler/occurrenceAnalysis.js';
import {assessSchemaProfile} from '../../src/compiler/assessSchemaProfile.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {OccurrenceAnalysis} from '../../src/compiler/occurrenceAnalysis.js';
const ns='urn:measure', id=(local:string)=>globalId('type',{namespace:ns,local});
async function input(body:string){
const bytes=Buffer.from(`<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="${ns}" targetNamespace="${ns}">${body}</xs:schema>`),source='https://measure.test/schema.xsd';
const i=await prepareResolvedCompilationInput({kind:'source',source},{loading:{policy:{allowedOrigins:['https://measure.test']},offlineResources:new Map([[source,{bytes,digest:createHash('sha256').update(bytes).digest('hex')}]])}});
if(i.kind!=='semantic')throw Error('semantic'); const a=analyzeOccurrences(i.composed);if(a.kind!=='analyzed')throw a.diagnostic; return a.analysis;
}
const rows:unknown[]=[];
function measure(name:string,a:OccurrenceAnalysis,roots:string[],limits={}){
const start=performance.now(), memory=process.memoryUsage().heapUsed;
const r=assessSchemaProfile(a,roots.length?[{kind:'components',id:'measurement',roots}]:[],limits);
rows.push({name,inputNodes:a.composed.resolved.graph.nodes.length,limits,ms:+(performance.now()-start).toFixed(3),heapDelta:process.memoryUsage().heapUsed-memory,result:r.kind==='failure'?r.diagnostic.category:r.assessment.operations.map(o=>o.kind),steps:r.kind==='assessed'?r.assessment.metrics.steps:undefined});return r;
}
const a=await input('<xs:complexType name="T"><xs:sequence><xs:element name="child" type="t:T" minOccurs="0" maxOccurs="unbounded"/></xs:sequence></xs:complexType>');
const first=measure('recursive',a,[id('T')]); if(first.kind!=='assessed')throw Error('assessed');
const steps=first.assessment.metrics.steps; measure('recursive-at-work',a,[id('T')],{maxSteps:steps});measure('recursive-beyond-work',a,[id('T')],{maxSteps:steps-1});
measure('recursive-at-nodes',a,[id('T')],{maxNodes:a.composed.resolved.graph.nodes.length});measure('recursive-beyond-nodes',a,[id('T')],{maxNodes:a.composed.resolved.graph.nodes.length-1});
const integer='9'.repeat(200); const big=await input(`<xs:complexType name="T"><xs:sequence minOccurs="${integer}" maxOccurs="${integer}"><xs:element name="a" type="xs:string"/></xs:sequence></xs:complexType>`);measure('200-digit-exact-repeat',big,[id('T')]);
let groups='<xs:group name="G0"><xs:sequence><xs:element name="a" type="xs:string"/></xs:sequence></xs:group>';
for(let n=1;n<=20;n++)groups+=`<xs:group name="G${n}"><xs:sequence><xs:group ref="t:G${n-1}"/><xs:group ref="t:G${n-1}"/></xs:sequence></xs:group>`;
const shared=await input(groups+'<xs:complexType name="T"><xs:sequence><xs:group ref="t:G20"/></xs:sequence></xs:complexType>');measure('shared-binary-depth20-default',shared,[id('T')]);
const seed=await input('<xs:simpleType name="T"><xs:restriction base="xs:string"/></xs:simpleType>');
for(const count of [100000,100001]){
const graph=seed.composed.resolved.graph, template=graph.nodes[0];
const nodes=Object.freeze(Array.from({length:count},(_,n)=>Object.freeze({...template,id:id('T'+n),identity:Object.freeze({kind:'global' as const,role:'type' as const,name:Object.freeze({namespace:ns,local:'T'+n})})})));
const expanded=Object.freeze({...seed,composed:Object.freeze({...seed.composed,resolved:Object.freeze({...seed.composed.resolved,graph:Object.freeze({...graph,nodes})})})});
// Synthetic immutable input-index probe only: no source/schema acceptance claim.
measure('input-index-'+count,expanded,[]);
}
mkdirSync('tmp/conformance/assessment', {recursive:true});
writeFileSync('tmp/conformance/assessment/measurements.json',JSON.stringify({node:process.version,unicode:process.versions.unicode,icu:process.versions.icu,rows},null,2)+'\n');
