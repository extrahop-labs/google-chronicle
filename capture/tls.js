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
      CHRONICLE_EVENT_TYPE = 'NETWORK_CONNECTION',
      SENDER = Flow.client,
      RECEIVER = Flow.server,
      RECORDS = ['~flow', '~ssl_open']

let Chronicle = {principal:{}, target:{}, network:{}, additional:{}}

const clientCertificate = SSL.clientCertificate || null,
      serverCertificate = SSL.certificate || null,
      ciphers = SSL.cipherSuitesSupported || []

let version
switch (SSL.version)
{
  case 2: version = 'SSLv2'; break;
  case 768: version = 'SSLv3'; break;
  case 769: version = 'TLSv1.0'; break;
  case 770: version = 'TLSv1.1'; break;
  case 771: version = 'TLSv1.2'; break;
  case 772: version = 'TLSv1.3'; break;
  default: version = null
}

Chronicle.network.tls = {
  'client': {
    'ja3': SSL.ja3Hash,
    'server_name': SSL.host || SSL.getClientExtensionData(0),
    'supported_ciphers': ! ciphers.length ? null : ciphers.map(c=>c.name)
  },
  'server': {
    'ja3s': SSL.ja3sHash
  },
  'cipher': SSL.cipherSuite,
  'curve': null,
  'version': version,
  'version_protocol': SSL.version < 769 ? 'SSL' : 'TLS',
  'established': (! SSL.isAborted),
  'next_protocol': SSL.startTLSProtocol || null,
  'resumed': SSL.isResumed
}

Chronicle.additional = {
  'is_decrypted': (SSL.privateKeyId),
  'client_hello_version': SSL.clientHelloVersion,
  'server_hello_version': SSL.serverHelloVersion,
  'is_start_tls': SSL.isStartTLS,
  'start_tls_protocol': SSL.startTLSProtocol,
  'is_weak_cipher': SSL.isWeakCipherSuite,
  'client_certificate_requested': SSL.clientCertificateRequested
}

let notBefore, notAfter
if (clientCertificate)
{
  notBefore = 
    clientCertificate.notBefore
    ? new Date(Math.trunc(clientCertificate.notBefore)).toISOString()
    : null

  notAfter = 
    clientCertificate.notAfter
    ? new Date(Math.trunc(clientCertificate.notAfter)).toISOString()
    : null

  Chronicle.network.tls.client.certificate = {
    'version': null,
    'serial': null,
    'subject': clientCertificate.subject,
    'issuer': clientCertificate.issuer,
    'md5': null,
    'sha1': clientCertificate.fingerprint,
    'sha256': null,
    'not_before': notBefore,
    'not_after': notAfter
  }
}

if (serverCertificate)
{
  notBefore = 
    serverCertificate.notBefore
    ? new Date(Math.trunc(serverCertificate.notBefore)).toISOString()
    : null

  notAfter = 
    serverCertificate.notAfter
    ? new Date(Math.trunc(serverCertificate.notAfter)).toISOString()
    : null

  Chronicle.network.tls.server.certificate = {
    'version': null,
    'serial':serverCertificate.serial,
    'subject': serverCertificate.subject,
    'issuer': serverCertificate.issuer,
    'md5': null,
    'sha1': serverCertificate.fingerprint,
    'sha256': null,
    'not_before': notBefore,
    'not_after': notAfter
  }

  Chronicle.additional.certificate_is_self_signed =
    serverCertificate.isSelfSigned
}

return debug(JSON.stringify(Chronicle))

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