/**
 * Google Chronicle - Partner Ingest API Integration (CAPTURE)
 * 
 * COPYRIGHT 2021 BY EXTRAHOP NETWORKS, INC.
 *
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE', which is part of this source code package.
 * 
 * This trigger translates wire data events to UDM event classes and puts them
 * in the Session store with the following session key pattern:
 * 
 *  CHRONICLE_SESSION_PREFIX.{Flow.id}.{timestamp}
 * 
 */
const CHRONICLE_SESSION_PREFIX = 'chronicle',
      CHRONICLE_EVENT_TYPE = 'NETWORK_DNS',
      SENDER = Flow.sender,
      RECEIVER = Flow.receiver,
      RECORDS = ['~flow', '~dns_request', '~dns_response']

let Chronicle = {principal:{}, target:{}, network:{}, additional:{}}

switch (event)
{
  case 'DNS_REQUEST':
    Chronicle.network.dns = {
      'id': DNS.txId,
      'response': false,
      'opcode': DNS.opcodeNum,
      'recursion_desired': DNS.isRecursionDesired,
      'questions': null
    }

    Chronicle.additional = {
      'is_checking_disabled': DNS.isCheckingDisabled,
      'is_dga': DNS.isDGADomain || false
    }
    break;

  case 'DNS_RESPONSE':
    Chronicle.network.dns = {
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

    Chronicle.additional = {
      'is_authentic': DNS.isAuthenticData,
      'error': DNS.error || null,
      'error_code': DNS.errorNum || null,
      'is_dga': DNS.isDGADomain || false
    }

    let answers = DNS.answers
    if (answers.length)
    {
      Chronicle.network.dns.answers = []
      for (const answer of answers)
      {
        Chronicle.network.dns.answers.push({
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
    Chronicle.network.dns.questions = [
      {
        'name': DNS.qname,
        'class': 1,
        'type':DNS.qtypeNum
      }
    ]
    break;

  case 5:
    Chronicle.network.dns.questions = [
      {
        'name': DNS.zname,
        'class': 1,
        'type': DNS.ztypeNum
      }
    ]
    break;
}

/**
* Creates a new Google Chronicle Session Table entry
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
        },
        senderIp = SENDER.ipaddr,
        receiverIp = RECEIVER.ipaddr

  return Session.add(sessionKey, {
    'event': event,
    'event_type': CHRONICLE_EVENT_TYPE,
    'record_types': RECORDS,
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
    'principal': Chronicle.principal,
    'target': Chronicle.target,
    'network': Chronicle.network,
    'additional': Chronicle.additional
  }, sessionOptions)
})()