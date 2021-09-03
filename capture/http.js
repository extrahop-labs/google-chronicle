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
      CHRONICLE_EVENT_TYPE = 'NETWORK_HTTP',
      SENDER = Flow.client,
      RECEIVER = Flow.server

let Chronicle = {principal:{}, target:{}, network:{}, additional:{}}

Chronicle.network.http = {
  'method': HTTP.method,
  'referral_url': HTTP.referer,
  'response_code': HTTP.statusCode,
  'user_agent': HTTP.userAgent
}

const scheme = (HTTP.isEncrypted ? 'https' : 'http'),
      host = HTTP.host.split(':')[0],
      path = HTTP.path || '/',
      query = (HTTP.query ? `?${HTTP.query}` : '')

Chronicle.target.url = `${scheme}://${host}${path}${query}`

if (scheme === 'https') {Chronicle.network.application_protocol = 'HTTPS'}

Chronicle.network.sent_bytes = HTTP.reqL2Bytes
Chronicle.network.received_bytes = HTTP.rspL2Bytes

Chronicle.additional = {
  'title': HTTP.title,
  'is_encrypted': HTTP.isEncrypted,
  'content_type': HTTP.contentType,
  'headers_raw': HTTP.headersRaw,
  'sqli': (HTTP.isSQLi ? HTTP.sqli : false),
  'xss': (HTTP.isXSS ? HTTP.xss : false),
  'query': HTTP.query
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