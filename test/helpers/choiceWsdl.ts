export interface SearchChoiceSchemaOptions {
  choiceMinOccurs?: number;
}

export function buildSearchChoiceSchema(opts: SearchChoiceSchemaOptions = {}): string {
  return `
  <xs:element name="SearchRequest" type="tns:SearchRequest"/>
  <xs:element name="SearchResponse">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="ok" type="xs:boolean"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
  <xs:complexType name="SearchRequest">
    <xs:sequence>
      <xs:element name="tenantId" type="xs:string"/>
      <xs:choice minOccurs="${opts.choiceMinOccurs ?? 0}" maxOccurs="1">
        <xs:element name="email" type="xs:string"/>
        <xs:element name="phone" type="xs:int"/>
      </xs:choice>
    </xs:sequence>
  </xs:complexType>`;
}

export const SEARCH_CHOICE_SCHEMA = buildSearchChoiceSchema();

export interface ChoiceWsdlOptions {
  namespace?: string;
  servicePrefix?: string;
}

export function buildChoiceWsdl(schemaBody: string, opts: ChoiceWsdlOptions = {}): string {
  const namespace = opts.namespace ?? "http://example.com/choice";
  const servicePrefix = opts.servicePrefix ?? "Choice";

  return `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="${namespace}"
  xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
  xmlns:xs="http://www.w3.org/2001/XMLSchema"
  targetNamespace="${namespace}">
  <wsdl:types>
    <xs:schema
      xmlns:tns="${namespace}"
      elementFormDefault="qualified"
      targetNamespace="${namespace}">
      ${schemaBody}
    </xs:schema>
  </wsdl:types>
  <wsdl:message name="SearchInput"><wsdl:part name="parameters" element="tns:SearchRequest"/></wsdl:message>
  <wsdl:message name="SearchOutput"><wsdl:part name="parameters" element="tns:SearchResponse"/></wsdl:message>
  <wsdl:portType name="${servicePrefix}PortType">
    <wsdl:operation name="Search">
      <wsdl:input message="tns:SearchInput"/>
      <wsdl:output message="tns:SearchOutput"/>
    </wsdl:operation>
  </wsdl:portType>
  <wsdl:binding name="${servicePrefix}Binding" type="tns:${servicePrefix}PortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <wsdl:operation name="Search">
      <soap:operation soapAction="urn:search"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="${servicePrefix}Service">
    <wsdl:port name="${servicePrefix}Port" binding="tns:${servicePrefix}Binding">
      <soap:address location="${namespace}"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`;
}
