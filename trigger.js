 /**
 * Google Chronicle - Partner Ingest API Integration
 */

let chronicle = new ChronicleHelper(`${yourApiKey}`)

switch (event)
{
  case 'DHCP_RESPONSE':
    if (DHCP.msgType !== 'DHCPACK') {return}

    chronicle.dhcp = {
      'transaction_id': DHCP.txId,
      'type': 'ACK',
      'opcode': 'BOOTREPLY',
      'htype': DHCP.htype,
      'chaddr': DHCP.chaddr.toLowerCase(),
      'hlen': 6,
      'yiaddr': DHCP.offeredAddr
    }

    let options = DHCP.options
    if (options.length)
    {
      for (var option of options)
      {
        switch (option.code)
        {
          case 12: chronicle.dhcp.client_hostname = `${option.payload}`; break;
          case 61: chronicle.dhcp.client_identifier = `${option.payload}`; break;
          case 67: chronicle.dhcp.file = `${option.payload}`; break;
          case 51: chronicle.dhcp.lease_time_seconds = option.payload; break;
          case 50: chronicle.dhcp.requested_address = `${option.payload}`; break;
          case 66: chronicle.dhcp.sname = `${option.payload}`; break;
        }
      }
    }
    break;

  case 'DNS_REQUEST':
    if (DNS.opcodeNum > 0) {return}

    chronicle.dns = {
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

    chronicle.dns = {
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
      chronicle.dns.answers = []
      for (var answer of answers)
      {
        chronicle.dns.answers.push({
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
          
    chronicle.target['url'] = `${scheme}://${host}${path}${query}`

    if (scheme == 'https')
    {
      chronicle.network.application_protocol = 'HTTPS'
    }

    chronicle.http = {
      'method': HTTP.method,
      'referral_url': HTTP.referer,
      'response_code': HTTP.statusCode,
      'user_agent': HTTP.userAgent
    }
    break;

  default: return;
}

chronicle.send()


/**
*  Google Chronicle Helper
* --------------------------------------------------------------------------- >
*/
function ChronicleHelper(apiKey=null)
{
  this.endpoint = `/v1/udmevents?key=${apiKey}`

  this.principal = {}
  this.target = {}
  this.network = {}

  this.dhcp = {}
  this.dns = {}
  this.http = {}

  this.send = () =>
  {
    const assetIdPrefix = `ExtraHop.RX:${System.uuid}`

    let myEvent = {
      'metadata': {
        'event_type': 'NETWORK_CONNECTION',
        'event_timestamp': new Date(Math.trunc(getTimestamp())).toISOString(),
        'product_event_type': event,
        'product_log_id': Flow.id,
        'vendor_name': 'ExtraHop',
        'product_name': 'RevealX',
        'url_back_to_product': 'https://sensor.i.rx.tours'
      },
      'network': this.network,
      'principal': {
        'asset_id': `${assetIdPrefix}.${this.principal.asset.device.id}`,
        'mac': this.principal.mac || null,
        'port': this.principal.asset.port
      },
      'target': {
        'asset_id': `${assetIdPrefix}.${this.target.asset.device.id}`,
        'mac': this.target.mac || null,
        'port': this.target.asset.port
      }
    }

    switch (event)
    {
      case 'DHCP_RESPONSE':
        myEvent.metadata.event_type = 'NETWORK_DHCP'
        myEvent.network.dhcp = this.dhcp
        break;

      case 'DNS_REQUEST':
      case 'DNS_RESPONSE':
        myEvent.metadata.event_type = 'NETWORK_DNS'
        myEvent.network.dns = this.dns

        if (this.principal.name)
        {myEvent.principal.hostname = this.principal.name}

        if (this.principal.asset.ipaddr)
        {myEvent.principal.ip = this.principal.asset.ipaddr}
        
        if (this.target.name)
        {myEvent.target.hostname = this.target.name}

        if (this.target.asset.ipaddr)
        {myEvent.target.ip = this.target.asset.ipaddr}

        break;

      case 'HTTP_RESPONSE':
        myEvent.metadata.event_type = 'NETWORK_HTTP'
        myEvent.network.http = this.http
        myEvent.target.url = this.target.url

        if (this.principal.name)
        {myEvent.principal.hostname = this.principal.name}

        if (this.principal.asset.ipaddr)
        {myEvent.principal.ip = this.principal.asset.ipaddr}

        if (this.target.name)
        {myEvent.target.hostname = this.target.name}

        if (this.target.asset.ipaddr)
        {myEvent.target.ip = this.target.asset.ipaddr}

        break;
    }

    Remote.HTTP('chronicle').post({
      path: this.endpoint,
      headers: {'X-RX-EVENT': event, 'X-RX-FLOW': Flow.id},
      payload: JSON.stringify({events:[myEvent]})
    })
  }

  this.setNouns = () =>
  {
    const client = Flow.client,
          clientIP = client.ipaddr,
          clientDevice = client.device,
          server = Flow.server,
          serverIP = server.ipaddr,
          serverDevice = server.device,
          internal = (!clientIP.isExternal && !serverIP.isExternal)

    let clientMAC = clientDevice.hwaddr,
        serverMAC = serverDevice.hwaddr
    if (clientMAC) {clientMAC = clientMAC.toLowerCase()}
    if (serverMAC) {serverMAC = serverMAC.toLowerCase()}

    let clientName = null,
        clientDNS = clientDevice.dnsNames,
        clientDHCP = clientDevice.dhcpName,
        clientNB = clientDevice.netbiosName
    if (clientDNS.length) {clientName = clientDNS[0]}
    else if (clientDHCP) {clientName = clientDHCP}
    else if (clientNB) {clientName = clientNB}

    let serverName = null,
        serverDNS = serverDevice.dnsNames,
        serverDHCP = serverDevice.dhcpName,
        serverNB = serverDevice.netbiosName
    if (serverDNS.length) {serverName = serverDNS[0]}
    else if (serverDHCP) {serverName = serverDHCP}
    else if (serverNB) {serverName = serverNB}

    let principal, target
    if (internal || serverIP.isExternal)
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
      'session_id': Flow.id,
      'ip_protocol': Flow.ipproto
    }

    const l7proto = Flow.l7proto.split(':')[0]
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
    }
    //else {network.application_protocol = 'UNKNOWN_APPLICATION_PROTOCOL'}

    if (serverIP.isBroadcast) {network.direction = 'BROADCAST'}
    else if (serverIP.isExternal) {network.direction = 'OUTBOUND'}
    else if (clientIP.isExternal) {network.direction = 'INBOUND'}
    //else {network.direction = 'UNKNOWN_DIRECTION'}

    this.principal = principal
    this.target = target
    this.network = network
  }

  this.setNouns()

  return this
}