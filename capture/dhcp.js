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
      CHRONICLE_EVENT_TYPE = 'NETWORK_DHCP',
      SENDER = Flow.sender,
      RECEIVER = Flow.receiver

let Chronicle = {principal:{}, target:{}, network:{}, additional:{}}

Chronicle.network.dhcp = {
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
    Chronicle.network.dhcp.opcode = 'BOOTREQUEST';
    break;

  case 'DHCPOFFER':
  case 'DHCPACK':
  case 'DHCPNAK':
    Chronicle.network.dhcp.opcode = 'BOOTREPLY';
    break;

  default:
    Chronicle.network.dhcp.opcode = 'UNKNOWN_OPCODE'
    Chronicle.network.dhcp.type = 'UNKNOWN_MESSAGE_TYPE'
}

if (DHCP.gwAddr) {Chronicle.network.dhcp.giaddr = `${DHCP.gwAddr}`}

switch (event)
{
  case 'DHCP_REQUEST':
    if (SENDER.ipaddr) {Chronicle.network.dhcp.ciaddr = `${SENDER.ipaddr}`}

    Chronicle.network.sent_bytes =
      Chronicle.network.received_bytes = DHCP.reqL2Bytes

    Chronicle.additional = {
      'param_req_list': DHCP.paramReqList,
      'vendor': DHCP.vendor
    }

    if (DHCP.clientReqDelay)
    {Chronicle.network.dhcp.seconds = DHCP.clientReqDelay}
    break;

  case 'DHCP_RESPONSE':
    Chronicle.network.sent_bytes =
      Chronicle.network.received_bytes = DHCP.rspL2Bytes

    if (DHCP.offeredAddr)
    {Chronicle.network.dhcp.yiaddr = `${DHCP.offeredAddr}`}
    break;

  default: return
}

let options = DHCP.options
if (options.length)
{
  Chronicle.network.dhcp.options = []
  for (const option of options)
  {
    Chronicle.network.dhcp.options.push({
      'code': option.code,
      'data': `${option.payload}`
    })

    switch (option.code)
    {
      case 12:
        Chronicle.network.dhcp.client_hostname = `${option.payload}`; break;
      case 61:
        Chronicle.network.dhcp.client_identifier = `${option.payload}`; break;
      case 67:
        Chronicle.network.dhcp.file = `${option.payload}`; break;
      case 51:
        Chronicle.network.dhcp.lease_time_seconds = option.payload; break;
      case 50:
        Chronicle.network.dhcp.requested_address = `${option.payload}`; break;
      case 66:
        Chronicle.network.dhcp.sname = `${option.payload}`; break;
    }
  }
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