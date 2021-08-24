# Google Chronicle - Partner Ingest API Integration

This integration utilizes multiple triggers in order to decouple the capture of metadata from the work of sending events to Chronicle. This also allows for sending events to Chronicle in batches versus realtime streaming. While the former is possible, the load on the sensor is too great.

## capture/*.js

The triggers in the `capture` folder are scoped to realtime network events where minimal processing is performed to capture artifacts which satisfy the requirements of the Chronicle UDM as well as relevant properties for the `metadata` and `additional` event nouns. These triggers include a common routine at the end which packages the data into a standard Session Table `entry` with a 30 second expiration timer.

## session/expire.js

The trigger in the `session` folder is scoped to the single `SESSION_EXPIRE` event which is executed at approximately 30 second intervals to evaluate all of the Session Table `entries` which have expired during the previous ~30 second interval. All of these `entries` are then converted to Chronicle `events` and sent as a list to Chronicle in a single POST.

## ExtraHop Events

The current version supports the ExtraHop events listed below with their corresponding Chronicle event types.

| ExtraHop Event | Chronicle Event |
| --- | --- |
| DHCP_REQUEST | NETWORK_DHCP |
| DHCP_RESPONSE | NETWORK_DHCP |
| DNS_REQUEST | NETWORK_DNS |
| DNS_RESPONSE | NETWORK_DNS |
| HTTP_RESPONSE | NETWORK_HTTP |

## Unified Data Model Properties for All Events

This section highlights the common properties populated for all events sent to Chronicle from ExtraHop with example values. Individual ExtraHop events are outlined in the next section, with samples payloads. The following examples in this section were taken from an `HTTP_RESPONSE` ExtraHop event.

#### Event metadata ([reference](https://cloud.google.com/chronicle/docs/unified-data-model/udm-field-list#event-metadata))
```
"metadata": {
  "event_type": "NETWORK_HTTP",
  "event_timestamp": "2021-07-13T20:03:09.020Z",
  "product_event_type": "HTTP_RESPONSE",
  "product_log_id": "00ffb77960edf17c",
  "vendor_name": "ExtraHop",
  "product_name": "RevealX",
  "url_back_to_product": " ... "
}
```

#### Noun metadata ([reference](https://cloud.google.com/chronicle/docs/unified-data-model/udm-field-list#noun-metadata))

The word Noun is an overarching term used to represent the entities: `principal`, `src`, `target`, `intermediary`, `observer`, and `about`. These entities have common attributes, but represent different objects in an event.

For all events sent by ExtraHop the appropriate nouns have the following properties included unless otherwise mentioned in the section below. For example, when `network.direction` is `INBOUND` or `OUTBOUND` the `principal` or `target` (respectively) will have their `asset_id`, `mac`, and `hostname` properties removed as Chronicle does not represent router & gateway interfaces. The example below illustrates this with an `OUTBOUND` transaction over HTTP.

```
"principal": {
  "asset_id": "ExtraHop.RevealX:${System.uuid}.${Device.id}",
  "mac": "02:f5:c5:9f:9c:fe",
  "ip": "10.1.0.173",
  "port": 46592,
  "hostname": "pc2.i.rx.tours"
},
"target": {
  "ip": "1.2.3.4",
  "port": 443,
  "url": "https://www.extrahop.com/"
}
```

#### Network metadata ([reference](https://cloud.google.com/chronicle/docs/unified-data-model/udm-field-list#network-metadata))

All of the event-specific fields are children of the `network` object as is shown in the sections below (ie. `network.http.method` for HTTP events). However, all events will include these base properties when sent from ExtraHop.

```
"network": {
  "session_id": "00ffb77960edf17c",
  "ip_protocol": "TCP",
  "application_protocol": "HTTPS",
  "sent_bytes": 339,
  "received_bytes": 2221,
  "direction": "OUTBOUND"
}
```

## ExtraHop Events

#### DHCP_REQUEST
```
{
  "metadata": {
    "event_type": "NETWORK_DHCP",
    "event_timestamp": "2021-07-13T20:46:12.131Z",
    "product_event_type": "DHCP_REQUEST",
    "product_log_id": "01082da960edfb93",
    "vendor_name": "ExtraHop",
    "product_name": "RevealX",
    "url_back_to_product": " ... "
  },
  "principal": {
    "asset_id": "ExtraHop.RevealX:f5889ea34a4c4357bb2e88a86d6fbce7.021d7f6c89600000",
    "mac": "02:1d:7f:6c:89:60",
    "ip": "10.1.0.244",
    "port": 68,
    "hostname": "pc1.i.rx.tours"
  },
  "target": {
    "asset_id": "ExtraHop.RevealX:f5889ea34a4c4357bb2e88a86d6fbce7.0295dfd0b4300000",
    "mac": "02:95:df:d0:b4:30",
    "ip": "10.1.0.1",
    "port": 67,
    "hostname": null
  },
  "network": {
    "session_id": "01082da960edfb93",
    "ip_protocol": "UDP",
    "application_protocol": "DHCP",
    "received_bytes": 346,
    "sent_bytes": 346,
    "dhcp": {
      "opcode": "BOOTREQUEST",
      "type": "REQUEST",
      "htype": 1,
      "hlen": 6,
      "hops": 0,
      "transaction_id": 3018890759,
      "seconds": 0,
      "flags": null,
      "ciaddr": "10.1.0.244",
      "yiaddr": "0.0.0.0",
      "siaddr": "0.0.0.0",
      "giaddr": "0.0.0.0",
      "chaddr": "02:1d:7f:6c:89:60",
      "client_hostname": "pc1",
      "client_identifier": "AQIdf2zvv71g",
      "file": null,
      "lease_time_seconds": null,
      "requested_address": null,
      "sname": null,
      "options": [
        {
          "code": 53,
          "data": "Mw=="
        },
        {
          "code": 61,
          "data": "AQIdf2zvv71g"
        },
        {
          "code": 12,
          "data": "cGMx"
        },
        {
          "code": 81,
          "data": "AAAAcGMxLmF0dGFjay5sb2NhbA=="
        },
        {
          "code": 60,
          "data": "TVNGVCA1LjA="
        },
        {
          "code": 55,
          "data": "AQ8DBiwuLx8hee+/ve+/vSs="
        }
      ]
    }
  },
  "additional": {
    "param_req_list": "1,15,3,6,44,46,47,31,33,121,249,252,43",
    "vendor": "MSFT 5.0"
  }
}
```

#### DHCP_RESPONSE
```
{
  "metadata": {
    "event_type": "NETWORK_DHCP",
    "event_timestamp": "2021-07-13T20:46:12.131Z",
    "product_event_type": "DHCP_RESPONSE",
    "product_log_id": "01082da960edfb93",
    "vendor_name": "ExtraHop",
    "product_name": "RevealX",
    "url_back_to_product": " ... "
  },
  "principal": {
    "asset_id": "ExtraHop.RevealX:f5889ea34a4c4357bb2e88a86d6fbce7.0295dfd0b4300000",
    "mac": "02:95:df:d0:b4:30",
    "ip": "10.1.0.1",
    "port": 67,
    "hostname": null
  },
  "target": {
    "asset_id": "ExtraHop.RevealX:f5889ea34a4c4357bb2e88a86d6fbce7.021d7f6c89600000",
    "mac": "02:1d:7f:6c:89:60",
    "ip": "10.1.0.244",
    "port": 68,
    "hostname": "pc1.i.rx.tours"
  },
  "network": {
    "session_id": "01082da960edfb93",
    "ip_protocol": "UDP",
    "application_protocol": "DHCP",
    "received_bytes": 590,
    "sent_bytes": 590,
    "dhcp": {
      "opcode": "BOOTREPLY",
      "type": "ACK",
      "htype": 1,
      "hlen": 6,
      "hops": 0,
      "transaction_id": 3018890759,
      "seconds": 0,
      "flags": null,
      "ciaddr": "0.0.0.0",
      "yiaddr": "10.1.0.244",
      "siaddr": "0.0.0.0",
      "giaddr": "0.0.0.0",
      "chaddr": "02:1d:7f:6c:89:60",
      "client_hostname": null,
      "client_identifier": null,
      "file": null,
      "lease_time_seconds": 3600,
      "requested_address": null,
      "sname": null,
      "options": [
        {
          "code": 53,
          "data": "NQ=="
        },
        {
          "code": 54,
          "data": "MTAuMS4wLjE="
        },
        {
          "code": 51,
          "data": "MzYwMA=="
        },
        {
          "code": 1,
          "data": "LTI1Ng=="
        },
        {
          "code": 15,
          "data": "aS5yeC50b3Vycw=="
        },
        {
          "code": 3,
          "data": "MTAuMS4wLjE="
        },
        {
          "code": 6,
          "data": "MTAuMS4xLjEw"
        },
        {
          "code": 44,
          "data": "MTAuMS4xLjEw"
        },
        {
          "code": 46,
          "data": "Mg=="
        }
      ]
    }
  }
}
```

#### DNS_REQUEST
```
{
  "metadata": {
    "event_type": "NETWORK_DNS",
    "event_timestamp": "2021-07-13T20:54:01.774Z",
    "product_event_type": "DNS_REQUEST",
    "product_log_id": "01392ed060edfd6a",
    "vendor_name": "ExtraHop",
    "product_name": "RevealX",
    "url_back_to_product": " ... "
  },
  "principal": {
    "asset_id": "ExtraHop.RevealX:f5889ea34a4c4357bb2e88a86d6fbce7.021d7f6c89600000",
    "mac": "02:1d:7f:6c:89:60",
    "ip": "10.1.0.244",
    "port": 60834,
    "hostname": "pc1.i.rx.tours"
  },
  "target": {
    "asset_id": "ExtraHop.RevealX:f5889ea34a4c4357bb2e88a86d6fbce7.02a0d812c5820000",
    "mac": "02:a0:d8:12:c5:82",
    "ip": "10.1.1.10",
    "port": 53,
    "hostname": "dc1.attack.local"
  },
  "network": {
    "session_id": "01392ed060edfd6a",
    "ip_protocol": "UDP",
    "application_protocol": "DNS",
    "dns": {
      "id": 62660,
      "response": false,
      "opcode": 0,
      "recursion_desired": true,
      "questions": [
        {
          "name": "ec2.us-east-2.amazonaws.com",
          "class": 1,
          "type": 1
        }
      ]
    }
  },
  "additional": {
    "is_checking_disabled": false
  }
}
```

#### DNS_RESPONSE
```
{
  "metadata": {
    "event_type": "NETWORK_DNS",
    "event_timestamp": "2021-07-13T20:54:01.774Z",
    "product_event_type": "DNS_RESPONSE",
    "product_log_id": "01392ed060edfd6a",
    "vendor_name": "ExtraHop",
    "product_name": "RevealX",
    "url_back_to_product": " ... "
  },
  "principal": {
    "asset_id": "ExtraHop.RevealX:f5889ea34a4c4357bb2e88a86d6fbce7.02a0d812c5820000",
    "mac": "02:a0:d8:12:c5:82",
    "ip": "10.1.1.10",
    "port": 53,
    "hostname": "dc1.attack.local"
  },
  "target": {
    "asset_id": "ExtraHop.RevealX:f5889ea34a4c4357bb2e88a86d6fbce7.021d7f6c89600000",
    "mac": "02:1d:7f:6c:89:60",
    "ip": "10.1.0.244",
    "port": 60834,
    "hostname": "pc1.i.rx.tours"
  },
  "network": {
    "session_id": "01392ed060edfd6a",
    "ip_protocol": "UDP",
    "application_protocol": "DNS",
    "dns": {
      "authoritative": false,
      "id": 62660,
      "response": true,
      "opcode": 0,
      "recursion_available": true,
      "response_code": 0,
      "truncated": false,
      "questions": [
        {
          "name": "ec2.us-east-2.amazonaws.com",
          "class": 1,
          "type": 1
        }
      ],
      "answers": [
        {
          "class": 1,
          "data": "52.95.18.3",
          "name": "ec2.us-east-2.amazonaws.com",
          "ttl": 11,
          "type": 1
        }
      ],
      "authority": null,
      "additional": null
    }
  },
  "additional": {
    "is_authentic": false,
    "error": null,
    "error_code": null
  }
}
```

#### HTTP_RESPONSE
```
{
  "metadata": {
    "event_type": "NETWORK_HTTP",
    "event_timestamp": "2021-07-13T20:03:09.020Z",
    "product_event_type": "HTTP_RESPONSE",
    "product_log_id": "00ffb77960edf17c",
    "vendor_name": "ExtraHop",
    "product_name": "RevealX",
    "url_back_to_product": " ... "
  },
  "principal": {
    "asset_id": "ExtraHop.RevealX:f5889ea34a4c4357bb2e88a86d6fbce7.02f5c59f9cfe0000",
    "mac": "02:f5:c5:9f:9c:fe",
    "ip": "10.1.0.173",
    "port": 46592,
    "hostname": "pc2.i.rx.tours"
  },
  "target": {
    "ip": "1.2.3.4",
    "port": 443,
    "url": "https://web1.i.rx.tours/login.php"
  },
  "network": {
    "session_id": "00ffb77960edf17c",
    "ip_protocol": "TCP",
    "application_protocol": "HTTPS",
    "sent_bytes": 339,
    "received_bytes": 2221,
    "direction": "OUTBOUND",
    "http": {
      "method": "GET",
      "referral_url": null,
      "response_code": 200,
      "user_agent": "Mozilla/5.0 (Windows NT 6.3; Win64; x64; rv:76.0) Gecko/20100101 Firefox/76.0"
    }
  },
  "additional": {
    "title": "Login :: Damn Vulnerable Web Application (DVWA) v1.10",
    "is_encrypted": true,
    "content_type": "text/html",
    "headers_raw": "HTTP/1.1 200 OK\r\nDate: Tue, 13 Jul 2021 20:03:09 GMT\r\nServer: Apache/2.4.25 (Debian)\r\nSet-Cookie: PHPSESSID=81oi12ggs4p1rocj6n2ikl57t7; path=/\r\nExpires: Tue, 23 Jun 2009 12:00:00 GMT\r\nCache-Control: no-cache, must-revalidate\r\nPragma: no-cache\r\nSet-Cookie: PHPSESSID=81oi12ggs4p1rocj6n2ikl57t7; path=/\r\nSet-Cookie: security=low\r\nVary: Accept-Encoding\r\nContent-Length: 1523\r\nKeep-Alive: timeout=5, max=100\r\nConnection: Keep-Alive\r\nContent-Type: text/html;charset=utf-8\r\n\r\n",
    "sqli": false,
    "xss": false,
    "query": null
  }
}
```