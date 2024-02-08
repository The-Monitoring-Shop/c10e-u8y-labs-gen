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
  console.log("Payment Value : " + val + ". Usecase = " + usecase + ". CardType = " + cardType);
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
  return { transactionId }
}
