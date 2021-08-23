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

GC.event = {
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
    GC.event.opcode = 'BOOTREQUEST';
    break;

  case 'DHCPOFFER':
  case 'DHCPACK':
  case 'DHCPNAK':
    GC.event.opcode = 'BOOTREPLY';
    break;

  default:
    GC.event.opcode = 'UNKNOWN_OPCODE'
    GC.event.type = 'UNKNOWN_MESSAGE_TYPE'
}

if (DHCP.gwAddr) {GC.event.giaddr = `${DHCP.gwAddr}`}

switch (event)
{
  case 'DHCP_REQUEST':
    GC.network.sent_bytes = GC.network.received_bytes = DHCP.reqL2Bytes

    GC.additional = {
      'param_req_list': DHCP.paramReqList,
      'vendor': DHCP.vendor
    }

    if (DHCP.clientReqDelay) {GC.event.seconds = DHCP.clientReqDelay}
    break;

  case 'DHCP_RESPONSE':
    GC.network.sent_bytes = GC.network.received_bytes = DHCP.rspL2Bytes

    if (DHCP.offeredAddr) {GC.event.yiaddr = `${DHCP.offeredAddr}`}
    break;

  default: return
}

let options = DHCP.options
if (options.length)
{
  GC.event.options = []
  for (var option of options)
  {
    GC.event.options.push({'code':option.code, 'data':`${option.payload}`})

    switch (option.code)
    {
      case 12: GC.event.client_hostname = `${option.payload}`; break;
      case 61: GC.event.client_identifier = `${option.payload}`; break;
      case 67: GC.event.file = `${option.payload}`; break;
      case 51: GC.event.lease_time_seconds = option.payload; break;
      case 50: GC.event.requested_address = `${option.payload}`; break;
      case 66: GC.event.sname = `${option.payload}`; break;
    }
  }
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