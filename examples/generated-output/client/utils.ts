/**
 * Weather WSDL data types for proper serialization/deserialization.
 * Used to distinguish between XML attributes and elements during conversion.
 */
export interface WeatherDataTypes {
  /** Maps type names to lists of property names that should be treated as XML attributes */
  Attributes: Record<string, readonly string[]>;
  /** Maps type names to their child element types for recursive processing */
  ChildrenTypes: Record<string, Readonly<Record<string, string>>>;
}

export const WEATHER_DATA_TYPES: WeatherDataTypes = {
  "Attributes": {
    "WeatherDescription": [],
    "ArrayOfWeatherDescription": [],
    "Temp": [],
    "POP": [],
    "Forecast": [],
    "ArrayOfForecast": [],
    "ForecastReturn": [],
    "WeatherReturn": [],
    "GetWeatherInformation": [],
    "GetWeatherInformationResponse": [],
    "GetCityForecastByZIP": [],
    "GetCityForecastByZIPResponse": [],
    "GetCityWeatherByZIP": [],
    "GetCityWeatherByZIPResponse": []
  },
  "ChildrenTypes": {
    "WeatherDescription": {
      "WeatherID": "number",
      "Description": "string",
      "PictureURL": "string"
    },
    "ArrayOfWeatherDescription": {
      "WeatherDescription": "WeatherDescription"
    },
    "Temp": {
      "MorningLow": "string",
      "DaytimeHigh": "string"
    },
    "POP": {
      "Nighttime": "string",
      "Daytime": "string"
    },
    "Forecast": {
      "Date": "string",
      "WeatherID": "number",
      "Desciption": "string",
      "Temperatures": "Temp",
      "ProbabilityOfPrecipiation": "POP"
    },
    "ArrayOfForecast": {
      "Forecast": "Forecast"
    },
    "ForecastReturn": {
      "Success": "boolean",
      "ResponseText": "string",
      "State": "string",
      "City": "string",
      "WeatherStationCity": "string",
      "ForecastResult": "ArrayOfForecast"
    },
    "WeatherReturn": {
      "Success": "boolean",
      "ResponseText": "string",
      "State": "string",
      "City": "string",
      "WeatherStationCity": "string",
      "WeatherID": "number",
      "Description": "string",
      "Temperature": "string",
      "RelativeHumidity": "string",
      "Wind": "string",
      "Pressure": "string",
      "Visibility": "string",
      "WindChill": "string",
      "Remarks": "string"
    },
    "GetWeatherInformation": {},
    "GetWeatherInformationResponse": {
      "GetWeatherInformationResult": "ArrayOfWeatherDescription"
    },
    "GetCityForecastByZIP": {
      "ZIP": "string"
    },
    "GetCityForecastByZIPResponse": {
      "GetCityForecastByZIPResult": "ForecastReturn"
    },
    "GetCityWeatherByZIP": {
      "ZIP": "string"
    },
    "GetCityWeatherByZIPResponse": {
      "GetCityWeatherByZIPResult": "WeatherReturn"
    }
  }
} as const;
