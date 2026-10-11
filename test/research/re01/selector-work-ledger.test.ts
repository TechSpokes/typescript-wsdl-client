/** Independently authored by the nonauthor reviewer; independently recounted
 * and executed by the behavioral author at bbe5010. Null-request scope only.
 * Literal field inventories and sums are independent of subject constants.
 */
import assert from 'node:assert/strict';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {describe, it} from 'vitest';
import {runModelExperiment} from './model-selection.js';
import {runResearchCli} from './cli.js';

describe('independent selector request and output work ledger',()=>{
    it('counts malformed API diagnostics and normal report allocations',()=>{
        const contract = 'RE01-supplied-candidate-model-selection-v1';
        const model = 'derivation';
        const diagnostic = {code: 'invalid-supplied-candidate-request',rule:'research-input',context: `${contract}/${model}/`,related: []};
        const keys = Object.keys(diagnostic);
        const textFields = [diagnostic.code,diagnostic.rule,diagnostic.context];
        // Two root data reads with conservative descriptor allocations, then variant test.
        const boundary = (45+'input'.length)+(45+'candidate'.length)+4;
        // Declared fixed field inventories, counted independently as record + fields +
        // key-unit inspection plus one scan of comma-separated declaration text.
        const record = (fields: readonly string[]) => 1+fields.length+2*(fields.reduce((sum,key)=>sum+key.length,0)+fields.length-1);
        const diagnosticAllocation = record(keys);
        // Three snapshot containers; copied data record (8) + empty array (7).
        // Each popped object/array consumes two pops plus classification, with extra
        // empty-array length access. Four object fields each consume hasOwn,
        // 83 descriptor/key allowance, and copied value (1+text length or array7).
        const diagnosticSnapshot = 3+8+3+keys.reduce((sum,key,index)=>sum+1+83+key.length+(index<3?1+textFields[index]!.length:7),0)+4;
        // Freeze set/stack/root push, record and array visits, field descriptors/pushes,
        // and three primitive pops.
        const diagnosticFreeze = 3+5+keys.reduce((sum,key)=>sum+44+key.length,0)+6+3;
        const reportFields = ['model','contractVersion','selection','scope','kind','semanticVerdict','existentialVerdict','actualSchemaVerdict','diagnostic','receipt','usage'];
        const reportAllocation = record(reportFields);
        const reportTextReservation = model.length+contract.length+'input-error'.length+201;
        const expected = 79+2048+boundary+diagnosticAllocation+diagnosticSnapshot+diagnosticFreeze+reportAllocation+reportTextReservation;
        const report = runModelExperiment(null,model);
        assert.equal(report.kind,'input-error');
        assert.equal(report.usage.work,expected);
        const exact = runModelExperiment(null,model,{maxWork:expected});
        assert.equal(exact.kind,'input-error');
        const short = runModelExperiment(null,model,{maxWork:expected-1});
        assert.equal(short.kind,'resource-limit');
        assert.equal(short.receipt,undefined);
        assert.equal(expected,3513);
        assert.equal(report.usage.nodes,0);

    });
    it('counts the four-byte CLI input and complete serialized report',()=>{
        const path = 'tmp/conformance/selector-review/null.json';
        mkdirSync(dirname(path),{recursive:true});
        writeFileSync(path,'null');
        const model = 'derivation';
        const contract = 'RE01-supplied-candidate-model-selection-v1';
        const rootKeys = ['model','contractVersion','selection','scope','kind','semanticVerdict','existentialVerdict','actualSchemaVerdict','diagnostic','usage'];
        const possibleRootKeys = [...rootKeys,'receipt','limit'];
        const diagnosticKeys = ['code','rule','context','related'];
        const usageKeys = ['nodes','work'];
        const textValues = [model,contract,'explicit','supplied-candidate-structural-preparation','input-error','unresolved','unresolved','unresolved',
         'invalid-supplied-candidate-request','research-input',`${contract}/${model}/`];
        const sumText = textValues.reduce((sum,value)=>sum+value.length,0);
        const sumOutputKeys = [...rootKeys,...diagnosticKeys,...usageKeys].reduce((sum,key)=>sum+key.length,0);
        const envelope = 2+12+possibleRootKeys.reduce((sum,key)=>sum+key.length,0)+2+9+12;
        // Four object visits; 11 string primitive pops and two number primitive pops;
        // sixteen emitted fields, one descriptor-only undefined receipt field.
        const traversal = 1+4*3+11+2+sumText+16*45+sumOutputKeys+(44+'receipt'.length);
        // Newline, four containers, eleven quoted string values, two conservatively
        // reserved numeric values, sixteen escaped-key/colon/comma allowances.
        const outputBound = 1+4*2+11*2+2*24+16*4+6*(sumText+sumOutputKeys);
        const serializer = envelope+traversal+2*outputBound;
        // Each native Stats observation reserves a fixed 256 units; the independently
        // inspected Node 24 numeric record alone has14 fields/74name units (89 total).
        const input = 260+path.length+4+path.length+256+2+12*4+8+4;
        // Independent API null-input ledger: terminal79 plus all model wrapper work.
        const apiWorkWithoutInitialTerminal = 3513-79;
        const expected = 79+2048+8+input+apiWorkWithoutInitialTerminal+16+serializer;
        const args = ['--re01-model',model,'--candidate-file',path];
        const first=runResearchCli(args);
        const report=JSON.parse(first.output) as {usage:{nodes:number;work:number}};
        assert.equal(first.exitCode,1);
        assert.equal(report.usage.work,expected);
        assert.equal(report.usage.nodes,0);
        const exact=runResearchCli([...args,'--max-work',String(expected)]);
        assert.equal(exact.exitCode,1);
        assert.deepEqual((JSON.parse(exact.output) as {usage:unknown}).usage,report.usage);
        const short=runResearchCli([...args,'--max-work',String(expected-1)]);
        assert.equal(short.exitCode,3);
        assert.equal('receipt' in JSON.parse(short.output),false);
        assert.equal(expected,12426);

        rmSync(path);
    });
});

