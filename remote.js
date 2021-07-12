 /**
 * Google Chronicle - Partner Ingest API Integration (REMOTE)
 * 
 * This trigger catches session keys expired in the previous 30 seconds matching
 * the SESSION_KEY_PATTERN and translates them into Chronicle[events, ...] for a
 * single POST to the /v1/udmevents API endpoint at ~30 second intervals.
 * 
 * ** CONFIG **
 * 
 * The name of the configured Open Data Stream (ODS) target
 */const ODS_TARGET = 'chronicle'
 /* 
 * The unique key for your instance, provided by Chronicle
 */const CHRONICLE_KEY = ''
 /*
 * The pattern used to match expiring Session keys
 */const SESSION_KEY_PATTERN = /^chronicle\.\w+\.[0-9.]+$/
 /*
 * The value used when generating [metadata.url_back_to_product] for each event
 */const HOSTNAME = System.hostname

/**
 * RUNTIME **
 * 
 * (modify at your own risk ;-)
 * */
let chronicle = new ChronicleRemoteHelper()

for (const key of Session.expiredKeys || [])
{
  if (! SESSION_KEY_PATTERN.test(key.name)) {continue}
  chronicle.loadEvent(key.value)
}

chronicle.send()

/**
*  Google Chronicle Helper
* --------------------------------------------------------------------------- >
*/
function ChronicleRemoteHelper()
{
  this.odsTarget = ODS_TARGET
  this.endpoint = `/v1/udmevents?key=${CHRONICLE_KEY}`
  this.hostname = HOSTNAME
  this.events = []

  this.loadEvent = (data={}) =>
  {
    const {principal,target,network} = this.setNouns(data),
          url = this.setUrl(data.timestamp, data.type, data.flow),
          assetIdPrefix = `ExtraHop.RX:${System.uuid}`,
          timestamp = new Date(Math.trunc(data.timestamp)).toISOString()

    let thisEvent = {
      'metadata': {
        'event_type': 'NETWORK_CONNECTION',
        'event_timestamp': timestamp,
        'product_event_type': data.type,
        'product_log_id': data.flow,
        'vendor_name': 'ExtraHop',
        'product_name': 'RevealX',
        'url_back_to_product': url
      },
      'network': network,
      'principal': {
        'asset_id': `${assetIdPrefix}.${principal.asset.device.id}`,
        'mac': principal.mac || null,
        'port': principal.asset.port
      },
      'target': {
        'asset_id': `${assetIdPrefix}.${target.asset.device.id}`,
        'mac': target.mac || null,
        'port': target.asset.port
      }
    }

    switch (data.type)
    {
      case 'DHCP_REQUEST':
      case 'DHCP_RESPONSE':
        thisEvent.metadata.event_type = 'NETWORK_DHCP'
        thisEvent.network.dhcp = data.event
        break;

      case 'DNS_REQUEST':
      case 'DNS_RESPONSE':
        thisEvent.metadata.event_type = 'NETWORK_DNS'
        thisEvent.network.dns = data.event

        if (principal.name)
        {thisEvent.principal.hostname = principal.name}

        if (principal.asset.ip)
        {thisEvent.principal.ip = principal.asset.ip.addr}

        if (target.name)
        {thisEvent.target.hostname = target.name}

        if (target.asset.ip)
        {thisEvent.target.ip = target.asset.ip.addr}

        break;

      case 'HTTP_RESPONSE':
        thisEvent.metadata.event_type = 'NETWORK_HTTP'
        thisEvent.network.http = data.event
        thisEvent.target.url = target.url

        if (principal.name)
        {thisEvent.principal.hostname = principal.name}

        if (principal.asset.ip)
        {thisEvent.principal.ip = principal.asset.ip.addr}

        if (target.name)
        {thisEvent.target.hostname = target.name}

        if (target.asset.ip)
        {thisEvent.target.ip = target.asset.ip.addr}

        break;
    }

    this.events.push(thisEvent)
  }

  this.setNouns = (data={}) =>
  {
    const client = data.client,
          server = data.server

    const internal = (
      (!client.ip || !client.ip.external) && (!server.ip || !server.ip.external)
    )

    let clientMAC = client.device.hwaddr,
        serverMAC = server.device.hwaddr
    if (clientMAC) {clientMAC = clientMAC.toLowerCase()}
    if (serverMAC) {serverMAC = serverMAC.toLowerCase()}

    let clientName = null,
        clientDNS = client.device.dnsNames,
        clientDHCP = client.device.dhcpName,
        clientNB = client.device.netbiosName
    if (clientDNS.length) {clientName = clientDNS[0]}
    else if (clientDHCP) {clientName = clientDHCP}
    else if (clientNB) {clientName = clientNB}

    let serverName = null,
        serverDNS = server.device.dnsNames,
        serverDHCP = server.device.dhcpName,
        serverNB = server.device.netbiosName
    if (serverDNS.length) {serverName = serverDNS[0]}
    else if (serverDHCP) {serverName = serverDHCP}
    else if (serverNB) {serverName = serverNB}

    let principal, target
    if (internal || (server.ip && server.ip.external))
    {
      principal = {
        'asset': client,
        'name': clientName,
        'mac': clientMAC
      }
      target = {
        'asset': server,
        'name': serverName,
        'mac': serverMAC
      }
    }
    else
    {
      principal = {
        'asset': server,
        'name': serverName,
        'mac': serverMAC
      }
      target = {
        'asset': client,
        'name': clientName,
        'mac': clientMAC
      }
    }

    let network = {
      'session_id': data.flow,
      'ip_protocol': data.ipproto
    }

    const l7proto = data.l7proto.split(':')[0]
    switch (l7proto)
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
        network.application_protocol = l7proto
        break;

      case 'RPC':
      case 'MSRPC':
        network.application_protocol = 'RPC'
        break;

      case 'DB':
        network.application_protocol = 'TDS'
        break;

      // default: network.application_protocol = 'UNKNOWN_APPLICATION_PROTOCOL'
    }

    if (server.ip && server.ip.broadcast) {network.direction = 'BROADCAST'}
    else if (server.ip && server.ip.external) {network.direction = 'OUTBOUND'}
    else if (client.ip && client.ip.external) {network.direction = 'INBOUND'}
    //else {network.direction = 'UNKNOWN_DIRECTION'}

    return {
      principal: Object.assign(principal, data.principal),
      target: Object.assign(target, data.target),
      network: Object.assign(network, data.network)
    }
  }

  this.setUrl = (timestamp, eventType, flowId) =>
  {
    let types = ['~flow']
    switch (eventType)
    {
      case 'DHCP_REQUEST':
      case 'DHCP_RESPONSE':
        types = types.concat(['~dhcp_request','~dhcp_response'])
        break;
      case 'DNS_REQUEST':
      case 'DNS_RESPONSE':
        types = types.concat(['~dns_request','~dns_response'])
        break;
      case 'HTTP_REQUEST':
      case 'HTTP_RESPONSE':
        types = types.concat(['~http'])
        break;
    }

    types = types.map((type,i) => `r.types%5B${i}%5D=${type}`)

    const interval = (Math.trunc(timestamp / 1000))
    return [
      `https://${this.hostname}/extrahop/#/Records/create?delta_type`,
      `from=${interval - 1800}&interval_type=DT&until=${interval + 1800}`,
      'r.filter=' + this.Base64.encode(
        `[{"field":"flowId:string","operator":"=","operand":"${flowId}"}]`
      ),
      'r.sort%5B0%5D.direction=desc&r.sort%5B0%5D.field=timestamp',
      types.join('&'),
      'r.v=8.0',
      'return=clear'
    ].join('&')
  }

  this.send = () =>
  {
    if (! this.events.length) {return debug('No events to send')}

    debug(`Sending events:[${this.events.length}]`)
    Remote.HTTP(this.odsTarget).post({
      path: this.endpoint,
      payload: JSON.stringify({events:this.events})
    })
  }

  this.Base64 = cache('Base64', () =>
  {
    "use strict";
    const _keyStr="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    let _utf8_encode=(string)=>{let utftext="",c,n;string=string.replace(/\r\n/g,"\n");for(n=0;n<string.length;n++){c=string.charCodeAt(n);if(c<128){utftext+=String.fromCharCode(c)}else if((c>127)&&(c<2048)){utftext+=String.fromCharCode((c>>6)|192);utftext+=String.fromCharCode((c&63)|128)}else{utftext+=String.fromCharCode((c>>12)|224);utftext+=String.fromCharCode(((c>>6)&63)|128);utftext+=String.fromCharCode((c&63)|128)}}return utftext}
    let _utf8_decode=(utftext)=>{let string="",i=0,c=0,c1=0,c2=0;while(i<utftext.length){c=utftext.charCodeAt(i);if(c<128){string+=String.fromCharCode(c);i++;}else if((c>191)&&(c<224)){c1=utftext.charCodeAt(i+1);string+=String.fromCharCode(((c&31)<<6)|(c1&63));i+=2;}else{c1=utftext.charCodeAt(i+1);c2=utftext.charCodeAt(i+2);string+=String.fromCharCode(((c&15)<<12)|((c1&63)<<6)|(c2&63));i+=3;}}return string}
    let encode=(input)=>{let output="",chr1,chr2,chr3,enc1,enc2,enc3,enc4,i=0;input=_utf8_encode(input);while(i<input.length){chr1=input.charCodeAt(i++);chr2=input.charCodeAt(i++);chr3=input.charCodeAt(i++);enc1=chr1>>2;enc2=((chr1&3)<<4)|(chr2>>4);enc3=((chr2&15)<<2)|(chr3>>6);enc4=chr3&63;if(isNaN(chr2)){enc3=enc4=64;}else if(isNaN(chr3)){enc4=64;}output+=_keyStr.charAt(enc1);output+=_keyStr.charAt(enc2);output+=_keyStr.charAt(enc3);output+=_keyStr.charAt(enc4);}return output}
    let decode=(input)=>{let output="",chr1,chr2,chr3,enc1,enc2,enc3,enc4,i=0;input=input.replace(/[^A-Za-z0-9\+\/\=]/g,"");while(i<input.length){enc1=_keyStr.indexOf(input.charAt(i++));enc2=_keyStr.indexOf(input.charAt(i++));enc3=_keyStr.indexOf(input.charAt(i++));enc4=_keyStr.indexOf(input.charAt(i++));chr1=(enc1<<2)|(enc2>>4);chr2=((enc2&15)<<4)|(enc3>>2);chr3=((enc3&3)<<6)|enc4;output+=String.fromCharCode(chr1);if(enc3!==64){output+=String.fromCharCode(chr2)}if(enc4!==64){output+=String.fromCharCode(chr3)}}return _utf8_decode(output)}
    return {encode,decode}
  })

  return this
}