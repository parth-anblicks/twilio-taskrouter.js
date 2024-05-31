/* eslint-disable */

const chai = require('chai');
chai.use(require('sinon-chai'));

const assert = chai.assert;
const sinon = require('sinon');

import Supervisor from '../../../lib/Supervisor';
import Worker from '../../../lib/Worker';
import { token } from '../../mock/Token';
import { WorkerConfig } from '../../mock/WorkerConfig';
import { EventEmitter } from 'events';
import { API_V1 } from '../../../lib/util/Constants';

describe('Supervisor', () => {
  const fakeInitEvent = {
    account_sid: 'foo',
    channel_id: 'bar',
    workspace_sid: 'baz',
  };

  let request;
  let signaling;
  let supervisor;

  const Request = () => {
    request = createEmitterStub(require('../../../lib/util/Request').default);
    request.post = sinon.spy(() => Promise.resolve());
    request.get = sinon.spy(() => Promise.resolve());
    return request;
  };

  const FailRequest = () => {
    request = createEmitterStub(require('../../../lib/util/Request').default);
    request.post = sinon.spy(() => Promise.reject());
    request.get = sinon.spy(() => Promise.reject());
    return request;
  };

  const EventBridgeSignaling =
    () => signaling = createEmitterStub(require('../../../lib/signaling/EventBridgeSignaling').default);

  beforeEach(() => {
    supervisor = new Supervisor(token, WorkerConfig, { EventBridgeSignaling, Request });
  });

  it('should extend Worker', () => {
    assert(Supervisor.prototype instanceof Worker);
  });

  describe('.monitor()', () => {
    context('before initialization', () => {
      it('should throw', () => {
        assert.throws(() => supervisor.monitor('WA123', 'WA321'));
      });
    });

    context('once initialized', () => {
      beforeEach(() => {
        signaling.emit('init', fakeInitEvent);
      });

      it('should throw if taskSid is missing', () => {
        assert.throws(() => supervisor.monitor());
      });

      it('should throw if reservationSid is missing', () => {
        assert.throws(() => supervisor.monitor('WA123'));
      });

      it('should throw if extraParams is not an object', () => {
        assert.throws(() => supervisor.monitor('WA123', 'WA123', 'wrong'));
        assert.throws(() => supervisor.monitor('WA123', 'WA123', 123));
      });

      it('should make a valid POST request to API_V1', () => {
        supervisor.monitor('WA123', 'WA321');
        sinon.assert.calledWith(request.post,
          'Workspaces/baz/Tasks/WA123/Reservations/WA321',
          { Instruction: 'supervise', Supervisor: 'bar', SupervisorMode: 'monitor' },
          API_V1
        );
      });

      it('should pass along custom parameters, and not override mandatory parameters', () => {
        supervisor.monitor('WA123', 'WA321', { Foo: 'bar', Supervisor: '123' });
        sinon.assert.calledWith(request.post,
          'Workspaces/baz/Tasks/WA123/Reservations/WA321',
          { Instruction: 'supervise', Supervisor: 'bar', SupervisorMode: 'monitor', Foo: 'bar' },
          API_V1
        );
      });

      it('should resolve with void when successful', () => {
        return supervisor.monitor('WA123', 'WA321').then(reservation => {
          assert.strictEqual(typeof (reservation), 'undefined');
        });
      });

      it('should reject on failure', () => {
        supervisor = new Supervisor(token, WorkerConfig, { EventBridgeSignaling, Request: FailRequest });
        signaling.emit('init', fakeInitEvent);
        return supervisor.monitor('WA123', 'WA321').then(
          () => { throw new Error('Expected to reject'); },
          () => { return true; });
      });
    });
  });

  describe('.setWorkerAttributes()', () => {
    context('before initialization', () => {
      it('should throw', () => {
        assert.throws(() => supervisor.setWorkerAttributes('WA123', { Foo: 'bar' }));
      });
    })

    context('once initialized', () => {
      beforeEach(() => {
        signaling.emit('init', fakeInitEvent);
      });
  
      it('should throw if workerSid is missing', () => {
        assert.throws(() => supervisor.setWorkerAttributes());
      })

      it('should throw if attributes is not an object', () => {
        assert.throws(() => supervisor.setWorkerAttributes('WA123', 'wrong'));
        assert.throws(() => supervisor.setWorkerAttributes('WA123', 123));
      })

      it('should throw if workerSid is not a string', () => {
        assert.throws(() => supervisor.setWorkerAttributes(123, { Foo: 'bar' }));
      })

      it('should make a valid POST request to API_V1', () => {
        const attrbutes = { Foo: 'bar', skills: ['foo', 'bar'] }
        supervisor.setWorkerAttributes('WA123', attrbutes);
        sinon.assert.calledWith(request.post,
          'Workspaces/baz/Workers/WA123',
          { Attributes: attrbutes },
          API_V1
        );
      });
    })
  });

  describe('.setWorkerActivity()', () => {
    context('before initialization', () => {
      it('should throw', () => {
        assert.throws(() => supervisor.setWorkerActivity('WA123', 'bar'));
      });
    })

    context('once initialized', () => {
      beforeEach(() => {
        signaling.emit('init', fakeInitEvent);
      });
  
      it('should throw if workerSid is missing', () => {
        assert.throws(() => supervisor.setWorkerActivity());
      })

      it('should throw if activitySid is missing', () => {
        assert.throws(() => supervisor.setWorkerActivity('WA123'));
      })

      it('should throw if workerSid is not a string', () => {
        assert.throws(() => supervisor.setWorkerActivity(123, 'bar'));
      })

      it('should throw if activitySid is not a string', () => {
        assert.throws(() => supervisor.setWorkerActivity('WA123', 123));  
      })

      it('should make a valid POST request to API_V1', () => {
        supervisor.setWorkerActivity('WA123', 'bar');
        sinon.assert.calledWith(request.post,
          'Workspaces/baz/Workers/WA123',
          { ActivitySid: 'bar' },
          API_V1
        );
      })

      it('should fail when invalid options are provided', () => {
        assert.throws(() => supervisor.setWorkerActivity('WA123', 'bar', 'invalid_option'));
      })


      it('should succeed when valid option is provided', () => {
        supervisor.setWorkerActivity('WA123', 'bar', { rejectPendingReservations: 'foo' });
        sinon.assert.calledWith(request.post,
          'Workspaces/baz/Workers/WA123',
          { ActivitySid: 'bar', RejectPendingReservations: 'foo'},
          API_V1
        );
      })
    })
  })  
});

/**
 * Create a stub and mixin the EventEmitter functions. All methods are replaced with stubs,
 * except the EventEmitter functionality, which works as expected.
 * @param BaseClass - The base class to stub.
 * @returns A stubbed instance with EventEmitter mixed in.
 */
function createEmitterStub(BaseClass) {
  const stub = sinon.createStubInstance(BaseClass);

  Object.getOwnPropertyNames(EventEmitter.prototype).forEach(name => {
    const property = EventEmitter.prototype[name];
    if (typeof property !== 'function') { return; }
    stub[name] = property.bind(stub);
  });

  EventEmitter.constructor.call(stub);
  return stub;
}
