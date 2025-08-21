// src/types/soap.d.ts
declare module "soap" {
  export interface IOptions {
    [key: string]: any;
  }

  export interface ISecurity {
    [key: string]: any;
  }

  export class Client {
    [method: string]: any;
  }

  export function createClientAsync(
    wsdlUrl: string,
    options?: IOptions
  ): Promise<Client>;
}

