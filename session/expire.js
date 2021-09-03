/**
 * Google Chronicle - Partner Ingest API Integration (REMOTE)
 * 
 * COPYRIGHT 2021 BY EXTRAHOP NETWORKS, INC.
 *
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE', which is part of this source code package.
 * 
 * Catches all Session Table entries which have expired in the previous ~30s 
 * where the Entry Key matches SESSION_KEY_PATTERN. Each entry is translated 1:1
 * to a Chronicle event in UDM format then added to a list of events. Once all 
 * expired keys have been evaluated, the full list is sent to Chronicle via ODS
 * as a single POST to the /v1/udmevents API endpoint.
 * 
 * NOTE: When preparing a UDM event there are some operations which require high
 * compute cycles (ie. Base64 encoding of DHCP options data). Even though it is 
 * preferrable to keep this code grouped logically in the proper context, it has
 * been offloaded here in order to avoid running at the time of capture. These 
 * operations are all located within the captureOffload() function and 
 * maintained here for reference:
 * 
 * Delayed Processing (Post-Capture):
 *  Event: NETWORK_DHCP
 *    - network.dhcp.client_identifier: Base64 encode
 *    - network.dhcp.options[option]: Base64 encode each option.data
 * 
 * Config Options:
 * 
 * The unique key for your Chronicle instance (provided by Google)
 */const CHRONICLE_KEY = ''
/*
 * The value used when generating deep links [metadata.url_back_to_product]
 */const HOSTNAME = System.hostname
/* 
 * The name of the configured Open Data Stream (ODS) target on this Sensor
 */const ODS_TARGET = Remote.HTTP('chronicle')
/*
 * The pattern used to match expiring Session keys
 */const SESSION_KEY_PATTERN = /^chronicle\.\w+\.[0-9.]+$/
/*
 * Shim: Base64 Encoding
 */const myBase64 = cache('Base64', () =>
{
  'use strict';
  const _keyStr='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let _utf8_encode=(string)=>{let utftext="",c,n;string=string.replace(/\r\n/g,"\n");for(n=0;n<string.length;n++){c=string.charCodeAt(n);if(c<128){utftext+=String.fromCharCode(c)}else if((c>127)&&(c<2048)){utftext+=String.fromCharCode((c>>6)|192);utftext+=String.fromCharCode((c&63)|128)}else{utftext+=String.fromCharCode((c>>12)|224);utftext+=String.fromCharCode(((c>>6)&63)|128);utftext+=String.fromCharCode((c&63)|128)}}return utftext}
  let encode=(input)=>{let output="",chr1,chr2,chr3,enc1,enc2,enc3,enc4,i=0;input=_utf8_encode(input);while(i<input.length){chr1=input.charCodeAt(i++);chr2=input.charCodeAt(i++);chr3=input.charCodeAt(i++);enc1=chr1>>2;enc2=((chr1&3)<<4)|(chr2>>4);enc3=((chr2&15)<<2)|(chr3>>6);enc4=chr3&63;if(isNaN(chr2)){enc3=enc4=64;}else if(isNaN(chr3)){enc4=64;}output+=_keyStr.charAt(enc1);output+=_keyStr.charAt(enc2);output+=_keyStr.charAt(enc3);output+=_keyStr.charAt(enc4);}return output}
  return {encode}
})

/*
 * Runtime
 */
let Chronicle = []

for (const key of Session.expiredKeys || [])
{
  if (! SESSION_KEY_PATTERN.test(key.name)) {continue}
  Chronicle.push(parseSessionEntry(captureOffload(key.value)))
}

if (! Chronicle.length) {return debug('No events to send')}

if (! ODS_TARGET.post({
  path: `/v1/udmevents?key=${CHRONICLE_KEY}`,
  payload: JSON.stringify({events:Chronicle})
}))
{return log(`Error sending (${Chronicle.length}) events, check system logs`)}

debug(`Sent (${Chronicle.length}) events to Chronicle`)

/**
 *  Google Chronicle Definitions & Helpers
 * --------------------------------------------------------------------------- >
 * @typedef SessionEntryIp
 * @property {String} addr
 * @property {Boolean} external
 * @property {Boolean} broadcast
 * 
 * @typedef SessionEntryDevice
 * @property {Device} device
 * @property {SessionEntryIp} ip
 * @property {Number} port
 * 
 * @typedef SessionEntry
 * @property {String} event
 * @property {String} event_type
 * @property {Array} record_types
 * @property {Number} timestamp
 * @property {String} flow
 * @property {String} ipproto
 * @property {String} l7proto
 * @property {SessionEntryDevice} sender
 * @property {SessionEntryDevice} receiver
 * @property {Object} principal
 * @property {Object} target
 * @property {Object} network
 * @property {Object} additional
 * 
 * @typedef ChronicleEvent
 * @property {Object} metadata
 * @property {Object} principal
 * @property {Object} target
 * @property {Object} network
 * @property {Object} additional
 */

/**
 * @param {SessionEntry} entry
 * @return {SessionEntry}
 */
function captureOffload(entry)
{
  switch (entry.event_type)
  {
    case 'NETWORK_DHCP':

      if (entry.network.dhcp['client_identifier'])
      {
        entry.network.dhcp.client_identifier = myBase64.encode(
          entry.network.dhcp.client_identifier
        )
      }

      if (entry.network.dhcp.options)
      {
        entry.network.dhcp.options = entry.network.dhcp.options.map(
          option => ({
            'code': option.code,
            'data': myBase64.encode(option.data)
          })
        )
      }
      break
  }

  return entry
}

/**
 * @param {Number} timestamp
 * @param {String} flow_id
 * @param {Array} record_types
 * @returns {String}
 */
function createDeepLink(timestamp, flow_id, record_types=['~flow'])
{
  const interval = (Math.trunc(timestamp / 1000))
  return [
    `https://${HOSTNAME}/extrahop/#/Records/create?delta_type`,
    `from=${interval - 1800}&interval_type=DT`,
    'r.filter=' + myBase64.encode(
      `[{"field":"flowId:string","operator":"=","operand":"${flow_id}"}]`
    ),
    'r.sort%5B0%5D.direction=desc&r.sort%5B0%5D.field=timestamp',
    record_types.map((t,i) => `r.types%5B${i}%5D=${t}`).join('&'),
    'r.v=8.0',
    'return=clear',
    `until=${interval + 1800}`
  ].join('&')
}

/**
 * @param {Device} device
 */
function setHostname (device)
{
  const deviceDNS = device['dnsNames'] || [],
        deviceDHCP = device['dhcpName'],
        deviceNB = device['netbiosName']

  if (deviceDNS.length) {return deviceDNS[0]}
  else if (deviceDHCP) {return deviceDHCP}
  else if (deviceNB) {return deviceNB}

  return null
}

/**
 * @param {String} l7proto
 */
function setApplicationProtocol (l7proto = '')
{
  const l7tuple = l7proto.split(':')[0]
  switch (l7tuple)
  {
    case 'QUIC':
    case 'HTTP':
    case 'HTTPS':
    case 'DNS':
    case 'DHCP':
    case 'HL7':
    case 'LDAP':
    case 'MODBUS':
    case 'NFS':
    case 'NTP':
    case 'RDP':
    case 'RTP':
    case 'RTSP':
    case 'SIP':
    case 'SMB':
    case 'SMTP':
    case 'SSH':
      return l7tuple;

    case 'RPC':
    case 'MSRPC':
      return 'RPC';

    case 'DB':
      return 'TDS';

    // default: network.application_protocol = 'UNKNOWN_APPLICATION_PROTOCOL'
    default: return null
  }
}

/**
 * @param {SessionEntry} entry
 * @return {ChronicleEvent}
 */
function parseSessionEntry (entry)
{
  const assetIdPrefix = `ExtraHop.RevealX:${System.uuid}`

  const metadata = {
    event_type: entry.event_type,
    event_timestamp: new Date(Math.trunc(entry.timestamp)).toISOString(),
    product_event_type: entry.event,
    product_log_id: entry.flow,
    vendor_name: 'ExtraHop',
    product_name: 'RevealX',
    url_back_to_product: createDeepLink(
      entry.timestamp, entry.flow, entry.record_types
    )
  }

  let principal = {
    asset_id: `${assetIdPrefix}.${entry.sender.device.id}` || null,
    mac: (entry.sender.device.hwaddr || '').toLowerCase() || null,
    ip: entry.sender.ip ? entry.sender.ip.addr : null,
    port: entry.sender.port,
    hostname: (
      entry.principal['hostname']
      || setHostname(entry.sender.device)
    ) || null
  }

  let target = {
    asset_id: `${assetIdPrefix}.${entry.receiver.device.id}` || null,
    mac: (entry.receiver.device.hwaddr || '').toLowerCase() || null,
    ip: entry.receiver.ip ? entry.receiver.ip.addr : null,
    port: entry.receiver.port,
    hostname: (
      entry.target['hostname']
      || setHostname(entry.receiver.device)
    ) || null
  }

  let network = {
    session_id: entry.flow,
    ip_protocol: entry.ipproto,
    application_protocol: (
      entry.network['application_protocol']
      || setApplicationProtocol(entry.l7proto)
    ) || null
  }

  let additional = (
    Object.keys(entry.additional).length ? entry.additional : null
  )

  if (entry.receiver.ip && entry.receiver.ip.broadcast)
  {
    network.direction = 'BROADCAST'
    target.asset_id = null
    target.hostname = null
  }
  else if (entry.receiver.ip && entry.receiver.ip.external)
  {
    network.direction = 'OUTBOUND'
    target.asset_id = null
    target.mac = null
    target.hostname = null
  }
  else if (entry.sender.ip && entry.sender.ip.external)
  {
    network.direction = 'INBOUND'
    principal.asset_id = null
    principal.mac = null
    principal.hostname = null
  }

  if (entry.target['url'] !== undefined) {target.hostname = null}

  return {
    metadata,
    principal: Object.assign(principal, entry.principal),
    target: Object.assign(target, entry.target),
    network: Object.assign(network, entry.network),
    additional
  }
}