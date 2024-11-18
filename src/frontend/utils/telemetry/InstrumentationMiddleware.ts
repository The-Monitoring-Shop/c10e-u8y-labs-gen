// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { NextApiHandler } from 'next';
import { context, Exception, propagation, Span, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { metrics } from '@opentelemetry/api';
import { AttributeNames } from '../enums/AttributeNames';

const meter = metrics.getMeter('frontend');
const requestCounter = meter.createCounter('app.frontend.requests');
const errorCounter = meter.createCounter('app.frontend.errors');
const { AD_SERVICE_ADDR = '' } = process.env;
const { CART_SERVICE_ADDR = '' } = process.env;
const { CURRENCY_SERVICE_ADDR = '' } = process.env;
const { SHIPPING_SERVICE_ADDR = '' } = process.env;
const { CHECKOUT_SERVICE_ADDR = '' } = process.env;
const { PRODUCT_CATALOG_SERVICE_ADDR = '' } = process.env;
const { RECOMMENDATION_SERVICE_ADDR = '' } = process.env;

function randomIntFromInterval(min: number, max: number) 
{
	return Math.floor(Math.random() * (max - min + 1) + min);
}

const InstrumentationMiddleware = (handler: NextApiHandler): NextApiHandler => {
  return async (request, response) => {
    const { headers, method, url = '', httpVersion } = request;
    const [target] = url.split('?');

    let span;
    const baggage = propagation.getBaggage(context.active());
    if (baggage?.getEntry('synthetic_request')?.value == 'true') {
      // if synthetic_request baggage is set, create a new trace linked to the span in context
      // this span will look similar to the auto-instrumented HTTP span
      const syntheticSpan = trace.getSpan(context.active()) as Span;
      const tracer = trace.getTracer(process.env.OTEL_SERVICE_NAME as string);
      //span = tracer.startSpan(`HTTP ${method}`, {
      span = tracer.startSpan(`${url}`, {
        root: true,
        kind: SpanKind.SERVER,
        links: [{ context: syntheticSpan.spanContext() }],
        attributes: {
          'app.synthetic_request': true,
          [SemanticAttributes.HTTP_TARGET]: target,
          [SemanticAttributes.HTTP_METHOD]: method,
          [SemanticAttributes.HTTP_USER_AGENT]: headers['user-agent'] || '',
          [SemanticAttributes.HTTP_URL]: `${headers.host}${url}`,
          [SemanticAttributes.HTTP_FLAVOR]: httpVersion,
        },
      });
    } else {
      // continue current trace/span
      span = trace.getSpan(context.active()) as Span;
    }

    if (request.query['sessionId'] != null) {
      span.setAttribute(AttributeNames.SESSION_ID, request.query['sessionId']);
    }
    

    let gateway = "";
    let gateway_addr = "";

    let api = "none";
    
    if(target.split('/').length > 2)
    {
    	api = target.split('/')[2];	    
    }

    if(api == "data")
    {
            gateway = "adservice";
            gateway_addr = AD_SERVICE_ADDR;
    }
    if(api == "cart")
    {
		gateway = "cartservice";
		gateway_addr = CART_SERVICE_ADDR;

		if(request.body.hasOwnProperty('item'))
		{
			if(request.body.item.hasOwnProperty('productId'))
			{
      	    			span.setAttribute("app.product_id", request.body.item.productId);
	    			if (process.env.LABGEN_CASE == "0043")
 				{
					if(request.body.item.productId == "2ZYFJ3GM2N")
					{
	   					await new Promise(r => setTimeout(r, randomIntFromInterval(500, 2500)));
					}
				}
			}
			if(request.body.item.hasOwnProperty('quantity'))
			{
      	    			span.setAttribute("app.quantity", request.body.item.quantity);
			}
		}
		if(request.body.hasOwnProperty('userId'))
		{
      	    		span.setAttribute("app.user_id", request.body.userId);
		}



	    /*

    	    if (request.body['item']['productId'] != null) 
	    {
      	    	span.setAttribute("app.product_id", request.body.item['productId']);
	    }
    	    if (request.body.item['quantity'] != null) 
	    {
      	    	span.setAttribute("app.quantity", request.body.item['quantity']);
	    }
    	    if (request.body['userId'] != null) 
	    {
      	    	span.setAttribute("app.user_id", request.body['userId']);
	    }


	    if (process.env.LABGEN_CASE == "0043")
	    {
	    	await new Promise(r => setTimeout(r, randomIntFromInterval(500, 2500)));
	    }
	   */
    }
    if(api == "currency")
    {
            gateway = "currencyservice";
            gateway_addr = CURRENCY_SERVICE_ADDR;
    }
    if(api == "shipping")
    {
            gateway = "shippingservice";
            gateway_addr = SHIPPING_SERVICE_ADDR;
    }
    if(api == "checkout")
    {
            gateway = "checkoutservice";
            gateway_addr = CHECKOUT_SERVICE_ADDR;
    }
    if(api == "products")
    {
            gateway = "productcatalogeservice";
            gateway_addr = PRODUCT_CATALOG_SERVICE_ADDR;
    }
    if(api == "recommendations")
    {
            gateway = "recommendationservice";
            gateway_addr = RECOMMENDATION_SERVICE_ADDR;
    }

    let httpStatus = 200;
    try {
      await runWithSpan(span, async () => handler(request, response));
      httpStatus = response.statusCode;
    } catch (error) {
      span.recordException(error as Exception);
      span.setStatus({ code: SpanStatusCode.ERROR });
      httpStatus = 500;
      console.error(new Date() + ": Caught Error When Calling Gateway " + gateway);
      //console.error(error as Exception);
      errorCounter.add(1, { method, target, status: httpStatus, gateway: gateway, 'gateway.addr': gateway_addr });
      requestCounter.add(1, { method, target, status: httpStatus, gateway: gateway, 'gateway.addr': gateway_addr });
      span.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, httpStatus);
      if (baggage?.getEntry('synthetic_request')?.value == 'true') {
        span.end();
      }
      throw error;
    } 
    //finally {
      requestCounter.add(1, { method, target, status: httpStatus, gateway: gateway, 'gateway.addr': gateway_addr });
      span.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, httpStatus);
      if (baggage?.getEntry('synthetic_request')?.value == 'true') {
        span.end();
      }
      if(httpStatus != 200)
      {
           errorCounter.add(1, { method, target, status: httpStatus, gateway: gateway, 'gateway.addr': gateway_addr });
      }
    //}
  };
};

async function runWithSpan(parentSpan: Span, fn: () => Promise<unknown>) {
  const ctx = trace.setSpan(context.active(), parentSpan);
  return await context.with(ctx, fn);
}

export default InstrumentationMiddleware;
