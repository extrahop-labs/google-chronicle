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
      SENDER = Flow.client,
      RECEIVER = Flow.server

let GC = {principal:{}, target:{}, network:{}, additional:{}, event:{}}

GC.event = {
  'method': HTTP.method,
  'referral_url': HTTP.referer,
  'response_code': HTTP.statusCode,
  'user_agent': HTTP.userAgent
}

const scheme = (HTTP.isEncrypted ? 'https' : 'http'),
      host = HTTP.host.split(':')[0],
      path = HTTP.path || '/',
      query = (HTTP.query ? `?${HTTP.query}` : '')

GC.target.url = `${scheme}://${host}${path}${query}`

if (scheme === 'https') {GC.network.application_protocol = 'HTTPS'}

GC.network.sent_bytes = HTTP.reqL2Bytes
GC.network.received_bytes = HTTP.rspL2Bytes

GC.additional = {
  'title': HTTP.title,
  'is_encrypted': HTTP.isEncrypted,
  'content_type': HTTP.contentType,
  'headers_raw': HTTP.headersRaw,
  'sqli': (HTTP.isSQLi ? HTTP.sqli : false),
  'xss': (HTTP.isXSS ? HTTP.xss : false),
  'query': HTTP.query
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