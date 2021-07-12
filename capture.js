 /**
 * Google Chronicle - Partner Ingest API Integration (CAPTURE)
 * 
 * This trigger translates wire data events to UDM event classes and puts them
 * in the Session store with the following session key pattern:
 * 
 *  CHRONICLE_SESSION_PREFIX.{Flow.id}.{timestamp}
 * 
 * Each key is set to expire after 30 seconds, which will allows for the REMOTE
 * trigger to send events to Chronicle as batch every 30 seconds.
 * 
 * ** CONFIG **
 * 
 * The prefix for Session keys
 */const CHRONICLE_SESSION_PREFIX = 'chronicle'
 /* 

/**
 * RUNTIME **
 * 
 * (modify at your own risk ;-)
 * */
let chronicle = new ChronicleCaptureHelper()

switch (event)
{
  case 'DHCP_REQUEST':
  case 'DHCP_RESPONSE':
    chronicle.event = {'transaction_id': DHCP.txId}

    switch (DHCP.msgType)
    {
      case 'DHCPDISCOVER': chronicle.event.type = 'DISCOVER';break;
      case 'DHCPOFFER': chronicle.event.type = 'OFFER';break;
      case 'DHCPREQUEST': chronicle.event.type = 'REQUEST';break;
      case 'DHCPDECLINE': chronicle.event.type = 'DECLINE';break;
      case 'DHCPACK': chronicle.event.type = 'ACK';break;
      case 'DHCPNAK': chronicle.event.type = 'NACK';break;
      case 'DHCPRELEASE': chronicle.event.type = 'RELEASE';break;
      case 'DHCPINFORM': chronicle.event.type = 'INFORM';break;
      default: chronicle.event.type = 'UNKNOWN_MESSAGE_TYPE'
    }

    if (DHCP.chaddr)
    {
      chronicle.event.chaddr = DHCP.chaddr.toLowerCase()
      chronicle.event.hlen = 6
    }

    if (DHCP.gwAddr) {chronicle.event.giaddr = `${DHCP.gwAddr}`}
    if (DHCP.htype) {chronicle.event.htype = DHCP.htype}

    if (event == 'DHCP_REQUEST' && DHCP.clientReqDelay)
    {chronicle.event.seconds = DHCP.clientReqDelay}

    if (event == 'DHCP_RESPONSE' && DHCP.offeredAddr)
    {chronicle.event.yiaddr = `${DHCP.offeredAddr}`}

    let options = DHCP.options
    if (options.length)
    {
      for (var option of options)
      {
        switch (option.code)
        {
          case 12:chronicle.event.client_hostname = `${option.payload}`;break;
          case 61:chronicle.event.client_identifier = `${option.payload}`;break;
          case 67:chronicle.event.file = `${option.payload}`;break;
          case 51:chronicle.event.lease_time_seconds = option.payload;break;
          case 50:chronicle.event.requested_address = `${option.payload}`;break;
          case 66:chronicle.event.sname = `${option.payload}`;break;
        }
      }
    }
    debug(`${Flow.id}:${JSON.stringify(chronicle.event)}`)
    break;

  case 'DNS_REQUEST':
    if (DNS.opcodeNum > 0) {return}

    chronicle.event = {
      'id': DNS.txId,
      'response': false,
      'opcode': DNS.opcodeNum,
      'recursion_desired': DNS.isRecursionDesired,
      'questions': [
        {'name': DNS.qname, 'type': DNS.qtypeNum}
      ]
    }
    break;

  case 'DNS_RESPONSE':
    if (DNS.opcodeNum > 0) {return}

    chronicle.event = {
      'id': DNS.txId,
      'response': true,
      'opcode': DNS.opcodeNum,
      'authoritative': DNS.isAuthoritative,
      'recursion_available': DNS.isRecursionAvailable,
      'response_code': DNS.errorNum || 0,
      'truncated': DNS.isRspTruncated,
      'questions': [
        {'name': DNS.qname, 'type': DNS.qtypeNum}
      ]
    }

    let answers = DNS.answers
    if (answers.length)
    {
      chronicle.event.answers = []
      for (var answer of answers)
      {
        chronicle.event.answers.push({
          'data': `${answer.data}`,
          'name': answer.name,
          'ttl': answer.ttl,
          'type': answer.typeNum
        })
      }
    }
    break;

  case 'HTTP_RESPONSE':
    const scheme = (HTTP.isEncrypted ? 'https' : 'http'),
          host = HTTP.host.split(':')[0],
          path = HTTP.path || '/',
          query = (HTTP.query ? `?${HTTP.query}` : '')
          
    chronicle.target.url = `${scheme}://${host}${path}${query}`

    if (scheme == 'https')
    {
      chronicle.network.application_protocol = 'HTTPS'
    }

    chronicle.event = {
      'method': HTTP.method,
      'referral_url': HTTP.referer,
      'response_code': HTTP.statusCode,
      'user_agent': HTTP.userAgent
    }
    break;

  default: return;
}

chronicle.save()


/**
*  Google Chronicle Helper
* --------------------------------------------------------------------------- >
*/
function ChronicleCaptureHelper()
{
  this.principal = {}
  this.target = {}
  this.network = {}
  this.event = {}

  this.save = () =>
  {
    const timestamp = getTimestamp(),
          sessionKey = `${CHRONICLE_SESSION_PREFIX}.${Flow.id}.${timestamp}`,
          sessionOptions = {
            'expire': 30,
            'notify': true,
            'priority': Session.PRIORITY_HIGH
          },
          client = Flow.client,
          clientIp = client.ipaddr,
          server = Flow.server,
          serverIp = server.ipaddr

    let sessionData = {
      'type': event,
      'timestamp': timestamp,
      'flow': Flow.id,
      'ipproto': Flow.ipproto,
      'l7proto': Flow.l7proto,
      'client': {
        'device': client.device,
        'ip': (!clientIp ? null : {
          'addr': clientIp.toString(),
          'external': clientIp.isExternal,
          'broadcast': clientIp.isBroadcast
        }),
        'port': client.port
      },
      'server': {
        'device': server.device,
        'ip': (!serverIp ? null : {
          'addr': serverIp.toString(),
          'external': serverIp.isExternal,
          'broadcast': serverIp.isBroadcast
        }),
        'port': server.port
      },
      'principal': this.principal,
      'target': this.target,
      'network': this.network,
      'event': this.event
    }

    Session.add(sessionKey, sessionData, sessionOptions)
  }

  return this
}