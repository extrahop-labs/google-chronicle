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
    chronicle.event = {
      'opcode': null,
      'type': (/^DHCP([A-Z]+)$/.exec(DHCP.msgType || '') || [0,0])[1],
      'htype': 1,
      'hlen': 6,
      'hops': 0,
      'transaction_id': DHCP.txId,
      'seconds': 0,
      'flags': null,
      'ciaddr': '0.0.0.0',
      'yiaddr': '0.0.0.0',
      'siaddr': '0.0.0.0',
      'giaddr': '0.0.0.0',
      'chaddr': (DHCP.chaddr || '').toLowerCase() || null,
      'client_hostname': null,
      'client_identifier': null,
      'file': null,
      'lease_time_seconds': null,
      'requested_address': null,
      'sname': null,
      'options': null
    }

    switch (DHCP.msgType)
    {
      case 'DHCPDISCOVER':
      case 'DHCPREQUEST':
      case 'DHCPDECLINE':
      case 'DHCPRELEASE':
      case 'DHCPINFORM':
        chronicle.event.opcode = 'BOOTREQUEST';
        break;

      case 'DHCPOFFER':
      case 'DHCPACK':
      case 'DHCPNAK':
        chronicle.event.opcode = 'BOOTREPLY';
        break;

      default:
        chronicle.event.opcode = 'UNKNOWN_OPCODE'
        chronicle.event.type = 'UNKNOWN_MESSAGE_TYPE'
    }

    if (DHCP.gwAddr) {chronicle.event.giaddr = `${DHCP.gwAddr}`}

    if (event == 'DHCP_REQUEST')
    {
      chronicle.network.sent_bytes = 
        chronicle.network.received_bytes = DHCP.reqL2Bytes

      chronicle.additional = {
        'param_req_list': DHCP.paramReqList,
        'vendor': DHCP.vendor
      }

      if (DHCP.clientReqDelay) {chronicle.event.seconds = DHCP.clientReqDelay}

    }

    if (event == 'DHCP_RESPONSE')
    {
      chronicle.network.sent_bytes = 
        chronicle.network.received_bytes = DHCP.rspL2Bytes

      if (DHCP.offeredAddr) {chronicle.event.yiaddr = `${DHCP.offeredAddr}`}
    }

    let options = DHCP.options
    if (options.length)
    {
      chronicle.event.options = []
      for (var option of options)
      {
        chronicle.event.options.push({
          'code': option.code,
          'data': `${option.payload}`
        })

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
    break;

  case 'DNS_REQUEST':
    chronicle.event = {
      'id': DNS.txId,
      'response': false,
      'opcode': DNS.opcodeNum,
      'recursion_desired': DNS.isRecursionDesired,
      'questions': null
    }

    switch (DNS.opcodeNum)
    {
      case 0:
        chronicle.event.questions = [{
          'name': DNS.qname,
          'class': 1,
          'type': DNS.qtypeNum
        }]
        break;

      case 5:
        chronicle.event.questions = [{
          'name': DNS.zname,
          'class': 1,
          'type': DNS.ztypeNum
        }]
        break;
    }

    chronicle.additional = {
      'is_checking_disabled': DNS.isCheckingDisabled,
      'is_dga': DNS.isDGADomain
    }
    break;

  case 'DNS_RESPONSE':
    chronicle.event = {
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

    switch (DNS.opcodeNum)
    {
      case 0:
        chronicle.event.questions = [{
          'name': DNS.qname,
          'class': 1,
          'type': DNS.qtypeNum
        }]
        break;

      case 5:
        chronicle.event.questions = [{
          'name': DNS.zname,
          'class': 1,
          'type': DNS.ztypeNum
        }]
        break;
    }

    chronicle.additional = {
      'is_authentic': DNS.isAuthenticData,
      'error': DNS.error || null,
      'error_code': DNS.errorNum || null,
      'is_dga': DNS.isDGADomain
    }

    let answers = DNS.answers
    if (answers.length)
    {
      chronicle.event.answers = []
      for (var answer of answers)
      {
        chronicle.event.answers.push({
          'class': 1,
          'data': `${answer.data}`,
          'name': answer.name,
          'ttl': answer.ttl || 0,
          'type': answer.typeNum
        })
      }
    }
    break;

  case 'HTTP_RESPONSE':
    chronicle.event = {
      'method': HTTP.method,
      'referral_url': HTTP.referer,
      'response_code': HTTP.statusCode,
      'user_agent': HTTP.userAgent
    }

    const scheme = (HTTP.isEncrypted ? 'https' : 'http'),
          host = HTTP.host.split(':')[0],
          path = HTTP.path || '/',
          query = (HTTP.query ? `?${HTTP.query}` : '')

    chronicle.target.url = `${scheme}://${host}${path}${query}`

    if (scheme === 'https')
    {chronicle.network.application_protocol = 'HTTPS'}

    chronicle.network.sent_bytes = HTTP.reqL2Bytes
    chronicle.network.received_bytes = HTTP.rspL2Bytes

    chronicle.additional = {
      'title': HTTP.title,
      'is_encrypted': HTTP.isEncrypted,
      'content_type': HTTP.contentType,
      'headers_raw': HTTP.headersRaw,
      'sqli': (HTTP.isSQLi ? HTTP.sqli : false),
      'xss': (HTTP.isXSS ? HTTP.xss : false),
      'query': HTTP.query
    }
    break;

  default: return;
}

chronicle.save()


/**
*  Google Chronicle Helper
* ---------------------------------------------------------------------------- >
*/
function ChronicleCaptureHelper()
{
  this.principal = {}
  this.target = {}
  this.network = {}
  this.additional = {}
  this.event = {}

  this.save = () =>
  {
    const timestamp = getTimestamp(),
          sessionKey = `${CHRONICLE_SESSION_PREFIX}.${Flow.id}.${timestamp}`,
          sessionOptions = {
            'expire': 30,
            'notify': true,
            'priority': Session.PRIORITY_HIGH
          }

    let sender, receiver
    switch (event)
    {
      // Flip sender/receiver for Chronicle where separate events do not exist 
      // for REQUEST|RESPONSE and we need to trigger on RESPONSE
      case 'HTTP_RESPONSE':
        sender = Flow.receiver
        receiver = Flow.sender
        break;

      default:
        sender = Flow.sender
        receiver = Flow.receiver
    }

    const senderIp = sender.ipaddr,
          receiverIp = receiver.ipaddr

    let sessionData = {
      'type': event,
      'timestamp': timestamp,
      'flow': Flow.id,
      'ipproto': Flow.ipproto,
      'l7proto': Flow.l7proto,
      'sender': {
        'device': sender.device,
        'ip': (!senderIp ? null : {
          'addr': senderIp.toString(),
          'external': senderIp.isExternal,
          'broadcast': senderIp.isBroadcast
        }),
        'port': sender.port
      },
      'receiver': {
        'device': receiver.device,
        'ip': (!receiverIp ? null : {
          'addr': receiverIp.toString(),
          'external': receiverIp.isExternal,
          'broadcast': receiverIp.isBroadcast
        }),
        'port': receiver.port
      },
      'principal': this.principal,
      'target': this.target,
      'network': this.network,
      'additional': this.additional,
      'event': this.event
    }

    Session.add(sessionKey, sessionData, sessionOptions)
  }

  return this
}