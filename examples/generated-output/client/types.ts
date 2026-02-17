export interface ArrayOfForecast {

  /**
   * Child element.
   */

  /** @xsd {"kind":"element","type":"{http://ws.cdyne.com/WeatherWS/}Forecast","occurs":{"min":0,"max":"unbounded","nillable":true}} */
  Forecast?: Forecast[];
}

export interface ArrayOfWeatherDescription {

  /**
   * Child element.
   */

  /** @xsd {"kind":"element","type":"{http://ws.cdyne.com/WeatherWS/}WeatherDescription","occurs":{"min":0,"max":"unbounded","nillable":false}} */
  WeatherDescription?: WeatherDescription[];
}

export interface Forecast {

  /**
   * Children elements.
   */

  /** @xsd {"kind":"element","type":"xs:dateTime","occurs":{"min":1,"max":1,"nillable":false}} */
  Date: string;

  /** @xsd {"kind":"element","type":"{http://ws.cdyne.com/WeatherWS/}POP","occurs":{"min":1,"max":1,"nillable":false}} */
  ProbabilityOfPrecipiation: POP;

  /** @xsd {"kind":"element","type":"{http://ws.cdyne.com/WeatherWS/}temp","occurs":{"min":1,"max":1,"nillable":false}} */
  Temperatures: Temp;

  /** @xsd {"kind":"element","type":"xs:short","occurs":{"min":1,"max":1,"nillable":false}} */
  WeatherID: number;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  Desciption?: string;
}

export interface ForecastReturn {

  /**
   * Children elements.
   */

  /** @xsd {"kind":"element","type":"xs:boolean","occurs":{"min":1,"max":1,"nillable":false}} */
  Success: boolean;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  City?: string;

  /** @xsd {"kind":"element","type":"{http://ws.cdyne.com/WeatherWS/}ArrayOfForecast","occurs":{"min":0,"max":1,"nillable":false}} */
  ForecastResult?: ArrayOfForecast;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  ResponseText?: string;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  State?: string;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  WeatherStationCity?: string;
}

export interface GetCityForecastByZIP {

  /**
   * Child element.
   */

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  ZIP?: string;
}

export interface GetCityForecastByZIPResponse {

  /**
   * Child element.
   */

  /** @xsd {"kind":"element","type":"{http://ws.cdyne.com/WeatherWS/}ForecastReturn","occurs":{"min":0,"max":1,"nillable":false}} */
  GetCityForecastByZIPResult?: ForecastReturn;
}

export interface GetCityWeatherByZIP {

  /**
   * Child element.
   */

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  ZIP?: string;
}

export interface GetCityWeatherByZIPResponse {

  /**
   * Child element.
   */

  /** @xsd {"kind":"element","type":"{http://ws.cdyne.com/WeatherWS/}WeatherReturn","occurs":{"min":1,"max":1,"nillable":false}} */
  GetCityWeatherByZIPResult: WeatherReturn;
}

export interface GetWeatherInformation {
}

export interface GetWeatherInformationResponse {

  /**
   * Child element.
   */

  /** @xsd {"kind":"element","type":"{http://ws.cdyne.com/WeatherWS/}ArrayOfWeatherDescription","occurs":{"min":0,"max":1,"nillable":false}} */
  GetWeatherInformationResult?: ArrayOfWeatherDescription;
}

export interface POP {

  /**
   * Children elements.
   */

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  Daytime?: string;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  Nighttime?: string;
}

export interface Temp {

  /**
   * Children elements.
   */

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  DaytimeHigh?: string;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  MorningLow?: string;
}

export interface WeatherDescription {

  /**
   * Children elements.
   */

  /** @xsd {"kind":"element","type":"xs:short","occurs":{"min":1,"max":1,"nillable":false}} */
  WeatherID: number;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  Description?: string;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  PictureURL?: string;
}

export interface WeatherReturn {

  /**
   * Children elements.
   */

  /** @xsd {"kind":"element","type":"xs:boolean","occurs":{"min":1,"max":1,"nillable":false}} */
  Success: boolean;

  /** @xsd {"kind":"element","type":"xs:short","occurs":{"min":1,"max":1,"nillable":false}} */
  WeatherID: number;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  City?: string;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  Description?: string;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  Pressure?: string;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  RelativeHumidity?: string;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  Remarks?: string;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  ResponseText?: string;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  State?: string;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  Temperature?: string;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  Visibility?: string;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  WeatherStationCity?: string;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  Wind?: string;

  /** @xsd {"kind":"element","type":"xs:string","occurs":{"min":0,"max":1,"nillable":false}} */
  WindChill?: string;
}
