/**
 * Google Chronicle - Partner Ingest API Integration (CAPTURE)
 * 
 * This trigger translates wire data events to UDM event classes and puts them
 * in the Session store with the following session key pattern:
 * 
 *  CHRONICLE_SESSION_PREFIX.{Flow.id}.{timestamp}
 * 
 */
const CHRONICLE_SESSION_PREFIX = 'chronicle',
      SENDER = Flow.sender,
      RECEIVER = Flow.receiver

let GC = {principal:{}, target:{}, network:{}, additional:{}, event:{}}

switch (event)
{
  case 'DNS_REQUEST':
    GC.event = {
      'id': DNS.txId,
      'response': false,
      'opcode': DNS.opcodeNum,
      'recursion_desired': DNS.isRecursionDesired,
      'questions': null
    }

    GC.additional = {
      'is_checking_disabled': DNS.isCheckingDisabled,
      'is_dga': DNS.isDGADomain || false
    }
    break;

  case 'DNS_RESPONSE':
    GC.event = {
      'authoritative': DNS.isAuthoritative,
      'id': DNS.txId,
      'response': true,
      'opcode': DNS.opcodeNum,
      'recursion_available': DNS.isRecursionAvailable,
      'response_code': DNS.errorNum || 0,
      'truncated': DNS.isRspTruncated,
      'questions': null,
      'answers': null,
      'authority': null,
      'additional': null
    }

    GC.additional = {
      'is_authentic': DNS.isAuthenticData,
      'error': DNS.error || null,
      'error_code': DNS.errorNum || null,
      'is_dga': DNS.isDGADomain || false
    }

    let answers = DNS.answers
    if (answers.length)
    {
      GC.event.answers = []
      for (const answer of answers)
      {
        GC.event.answers.push({
          'class': 1,
          'data': `${answer.data}`,
          'name': answer.name,
          'ttl': answer.ttl || 0,
          'type': answer.typeNum
        })
      }
    }
    break;

  default: return
}

switch (DNS.opcodeNum)
{
  case 0:
    GC.event.questions = [{'name':DNS.qname, 'class':1, 'type':DNS.qtypeNum}]
    break;

  case 5:
    GC.event.questions = [{'name':DNS.zname, 'class':1, 'type':DNS.ztypeNum}]
    break;
}

/**
* Creates a new Google Chronicle (GC) Session Table entry
*
* Include this code at the bottom of all triggers running on CAPTURE events.
*/
const ChronicleSave = (() =>
{
  const timestamp = getTimestamp(),
        sessionKey = `${CHRONICLE_SESSION_PREFIX}.${Flow.id}.${timestamp}`,
        sessionOptions = {
          'expire': 30,
          'notify': true,
          'priority': Session.PRIORITY_HIGH
        }

  const senderIp = SENDER.ipaddr,
        receiverIp = RECEIVER.ipaddr

  let sessionData = {
    'type': event,
    'timestamp': timestamp,
    'flow': Flow.id,
    'ipproto': Flow.ipproto,
    'l7proto': Flow.l7proto,
    'sender': {
      'device': SENDER.device,
      'ip': (!senderIp ? null : {
        'addr': senderIp.toString(),
        'external': senderIp.isExternal,
        'broadcast': senderIp.isBroadcast
      }),
      'port': SENDER.port
    },
    'receiver': {
      'device': RECEIVER.device,
      'ip': (!receiverIp ? null : {
        'addr': receiverIp.toString(),
        'external': receiverIp.isExternal,
        'broadcast': receiverIp.isBroadcast
      }),
      'port': RECEIVER.port
    },
    'principal': GC.principal,
    'target': GC.target,
    'network': GC.network,
    'additional': GC.additional,
    'event': GC.event
  }

  return Session.add(sessionKey, sessionData, sessionOptions)
})()