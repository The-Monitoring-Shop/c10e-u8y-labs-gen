// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import type { NextApiHandler } from 'next';
import { Empty } from '../../protos/demo';
import { IProductCart } from '../../types/Cart';
import InstrumentationMiddleware from '../../utils/telemetry/InstrumentationMiddleware';

type TResponse = IProductCart | Empty;

//const handler: NextApiHandler<TResponse> = async ({ method, body, query }, res) => {
const handler: NextApiHandler<TResponse> = async ({ method }, res) => {
  switch (method) {
    case 'GET': {

      return res.status(200).json({ ping: "true" });
    }

    case 'POST': {

      return res.status(200).json({ ping: "true" });
    }

    case 'DELETE': {

      return res.status(204).send('');
    }

    default: {
      return res.status(405);
    }
  }
};

export default InstrumentationMiddleware(handler);
