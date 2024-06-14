// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0
const {context, propagation, trace, metrics} = require('@opentelemetry/api');
const cardValidator = require('simple-card-validator');
const { v4: uuidv4 } = require('uuid');

const logger = require('./logger');
const tracer = trace.getTracer('paymentservice');
const meter = metrics.getMeter('paymentservice');
const transactionsCounter = meter.createCounter('app.payment.transactions');
const paymentFail = meter.createCounter('app.payment.failed');
const cardcount = meter.createCounter('app.payment.card.count');
//const revenue = meter.createHistogram('app.payment.revenue');
const revenue = meter.createCounter('app.payment.revenue');
const transactionsResp = meter.createHistogram('app.payment.duration');

// The telescope purchase metric - used for advanced PromQL courses
// For each 'real' purchase through this service, we'll also add a pretend purchase to this metrici as well.
// Built from randomisations of the 'tele_specs' json object

const telescopePurchase = meter.createHistogram('app.telescope.purchase');
const tele_specs = {
		ts: ["Bresser","Celestron","Meade","Takahashi","Sky-Watcher"],
		type: [
			{type: "beginner", low: 89, mid: 150, high: 299},
			{type: "explorer", low: 300, mid: 700, high: 999},
			{type: "intermediate", low: 1000, mid: 2500, high: 4999},
			{type: "advanced", low: 5000, mid: 7500, high: 9999},
			{type: "professional", low: 10000, mid: 15000, high: 19560}],
		//mag: [40, 100, 200, 300],
		mag: [40],
		//weight: [2, 10, 50, 100],
		weight: [2],
		phone: ["N","Y"],
		kit: ["Y","N"],
		sun_filter: ["N","Y"],
		cents: [0, 50, 99]
	};



function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min); 
}


module.exports.charge = request => {
  const span = tracer.startSpan('charge');

  const startTime = new Date().getTime();

  const {
    creditCardNumber: number,
    creditCardExpirationYear: year,
    creditCardExpirationMonth: month
  } = request.creditCard;
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const lastFourDigits = number.substr(-4);
  const transactionId = uuidv4();

  const card = cardValidator(number);
  const { card_type: cardType, valid } = card.getCardDetails();

  const { units, nanos, currencyCode } = request.amount;

  let usecase = process.env.LABGEN_CASE || "0000";

  span.setAttributes({
    'app.payment.card_type': cardType,
    'app.payment.card_valid': valid
  });

  let val = parseFloat(request.amount.units.low + "." + (request.amount.nanos / 10000000));
  //console.log("Payment Value : " + val + ". Usecase = " + usecase + ". CardType = " + cardType);
  console.log("Payment Value : " + val + ". Usecase = " + usecase + ". CardType = " + cardType + ". Currency = " + currencyCode);
/*
  if (!valid) {
    paymentFail.add(1, {"app.payment.currency": currencyCode});
    console.error('Credit card info is invalid.');
    throw new Error('Credit card info is invalid.');
  }
  */

  if (!['visa', 'mastercard'].includes(cardType)) {
    paymentFail.add(1, {"app.payment.currency": currencyCode, 'cardType': cardType});
    console.error(`Sorry, we cannot process ${cardType} credit cards. Only VISA or MasterCard is accepted.`);
    throw new Error(`Sorry, we cannot process ${cardType} credit cards. Only VISA or MasterCard is accepted.`);
  }

  if ((currentYear * 12 + currentMonth) > (year * 12 + month) || (usecase == "0030" && cardType == 'mastercard')) {
    paymentFail.add(1, {"app.payment.currency": currencyCode, 'cardType': cardType});
    console.error(`The credit card (ending ${lastFourDigits}) expired on ${month}/${year}.`);
    throw new Error(`The credit card (ending ${lastFourDigits}) expired on ${month}/${year}.`);
  }

  // check baggage for synthetic_request=true, and add charged attribute accordingly
  const baggage = propagation.getBaggage(context.active());
  if (baggage && baggage.getEntry("synthetic_request") && baggage.getEntry("synthetic_request").value === "true") {
    span.setAttribute('app.payment.charged', false);
  } else {
    span.setAttribute('app.payment.charged', true);
  }

  if(usecase == "0020")	// Use case 0020 slows this process down by ramdom amount
  {
  	let waitTill = new Date(new Date().getTime() + getRandomInt(200,1000));
  	while(waitTill > new Date()){}
  }

  const endTime = new Date().getTime();
  const executionTime = endTime - startTime;

  span.end();

  logger.info({transactionId, cardType, lastFourDigits, amount: { units, nanos, currencyCode }}, "Transaction complete. Time taken: " + executionTime);
  transactionsCounter.add(1, {"app.payment.currency": currencyCode, 'cardType': cardType});
  let rando = Math.floor(Math.random() * 10);
  cardcount.add(1, {"app.payment.currency": currencyCode, 'cardType': cardType, 'id': rando });
  //revenue.record(val, {"app.payment.currency": currencyCode});
  revenue.add(val, {"app.payment.currency": currencyCode});
  transactionsResp.record(executionTime);


  // Build random, but sensible data for the telescopePurchase histogram

  let ts = tele_specs.ts[getRandomInt(0,tele_specs.ts.length)];
  let type = tele_specs.type[getRandomInt(0,tele_specs.type.length)];

  let mag_idx = getRandomInt(0,tele_specs.mag.length);
  let mag = tele_specs.mag[mag_idx];

  let phone_idx = getRandomInt(0,tele_specs.phone.length);
  let phone = tele_specs.phone[phone_idx];
	
  let kit_idx = getRandomInt(0,tele_specs.kit.length);
  let kit = tele_specs.kit[kit_idx];

  let sun_filter = tele_specs.sun_filter[getRandomInt(0,tele_specs.sun_filter.length)];
  //let cents = tele_specs.cents[getRandomInt(0,tele_specs.cents.length)];

  let ts_value = type.mid;
  let weight = 2;

  /*

  let price_weighting = (tele_specs.mag.length + tele_specs.phone.length + tele_specs.kit.length) / 3;
  let ts_value = 0;

  let this_weighting = mag_idx + phone_idx + kit_idx;

  if (this_weighting > price_weighting)
  {
	  ts_value = type.high;
	  weight = tele_specs.weight[getRandomInt(parseInt(tele_specs.weight.length / 2),tele_specs.weight.length)];
  }
  else
  {
	  if(getRandomInt(0, 2) == 1)
          {
                  ts_value = type.mid;
          }
          else
          {
                  ts_value = type.low;
          }
	  weight = tele_specs.weight[getRandomInt(0,parseInt(tele_specs.weight.length / 2))];
  }
  */

  let labels = {
	  ts: ts,
	  magnification: mag,
	  phone: phone,
	  weight: weight,
	  'sun-filter': sun_filter,
	  type: type.type,
	  kit: kit
  };


  //logger.info(this_weighting + " " + price_weighting + " " + ts_value);

  telescopePurchase.record(ts_value,labels);


  return { transactionId }
}
