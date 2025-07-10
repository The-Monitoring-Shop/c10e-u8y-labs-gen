<?php
// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0



use OpenTelemetry\API\Common\Instrumentation\Globals;
use OpenTelemetry\API\Trace\Span;
use OpenTelemetry\API\Trace\SpanKind;
use OpenTelemetry\API\Trace\StatusCode;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

function calculateQuote($jsonObject): float
{
    $quote = 0.0;
    $childSpan = Globals::tracerProvider()->getTracer('manual-instrumentation')
        ->spanBuilder('calculate-quote')
        ->setSpanKind(SpanKind::KIND_INTERNAL)
        ->startSpan();
    $childSpan->addEvent('Calculating quote');


    try {
        if (!array_key_exists('numberOfItems', $jsonObject)) {
            throw new \InvalidArgumentException('numberOfItems not provided');
        }
        $numberOfItems = intval($jsonObject['numberOfItems']);
        $quote = round(8.90 * $numberOfItems, 2);

        // Case 0015 - add a fake error
        $labgen_case = getenv('LABGEN_CASE');
        //echo "labgen case " . $labgen_case;
        if ($labgen_case == "0015")
        {
		echo "labgen case: " . $labgen_case . "\n";
		if (rand(1,4) == 4) // One in 4 chance of throwing divide by zero error
		{
        		echo "ERROR: Divide by zero!\n";
        		$childSpan->recordException(new \Exception('Division by zero.'));
        	        //$childSpan->setAttribute('http.status_code', 500);
        	        $childSpan->setStatus(StatusCode::STATUS_ERROR);
			$quote = 0;
		}
        }
	// Case 0017 - Same as case 0015, but instead of 1 in 4 chance, it throws every time
        if ($labgen_case == "0017")
        {
                echo "labgen case: " . $labgen_case . "\n";
                echo "ERROR: Divide by zero!\n";
                $childSpan->recordException(new \Exception('Division by zero.'));
                $childSpan->setStatus(StatusCode::STATUS_ERROR);
                $quote = 0;
        }

        $childSpan->setAttribute('app.quote.items.count', $numberOfItems);
        $childSpan->setAttribute('app.quote.cost.total', $quote);


        $childSpan->addEvent('Quote calculated, returning its value');
    } catch (\Exception $exception) {
        $childSpan->recordException($exception);
    } finally {
        $childSpan->end();
        return $quote;
    }
}

return function (App $app) {
    $app->post('/getquote', function (Request $request, Response $response) {
        $span = Span::getCurrent();
        $span->addEvent('Received get quote request, processing it');

        $jsonObject = $request->getParsedBody();

        $data = calculateQuote($jsonObject);

        $payload = json_encode($data);
        $response->getBody()->write($payload);
	if($data == 0 )
	{
		//echo $response->getStatusCode() . "\n";
		$response = $response->withStatus(500,'');
        	$response->getBody()->write(json_encode(''));
	}

        $span->addEvent('Quote processed, response sent back', [
            'app.quote.cost.total' => $data
        ]);

        return $response
            ->withHeader('Content-Type', 'application/json');
    });
};
