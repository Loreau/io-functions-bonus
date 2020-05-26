﻿import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as df from "durable-functions";
import { IHttpResponse } from "durable-functions/lib/src/classes";
import * as express from "express";
import { secureExpressApp } from "io-functions-commons/dist/src/utils/express";
import { setAppContext } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";
import { VerificaSoglia } from "./handler";

// Setup Express
const app = express();
secureExpressApp(app);

// Add express route
app.get("/v1/bonus/verifica/:fiscalcode", VerificaSoglia());

const azureFunctionHandler = createAzureFunctionHandler(app);

const httpStart: AzureFunction = (context: Context): void => {
  setAppContext(app, context);
  azureFunctionHandler(context);
};

export default httpStart;