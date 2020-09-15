---
title: 使用 OpenSSL 发送 IOS 推送通知 Apple Push Notification
category: 软件开发
---

苹果的推送服务的设计非常优秀和巧妙，开发者将消息发送到苹果的APN服务器，APN服务器将消息转发到设备上，设备与APN保持一个长连接即可，即保证了消息的实时性，又节省了系统资源，更省电。相比之下，Android这个粗放管理的耗电大户平台，直到2.2后才添加了类似的推送服务，而且还被墙了。

苹果的推送模式如下图所示：
![img](/img/posts/2012112721070094.jpg)

iOS应用首先要请求用户允许推送通知，用户允许后，应用会获得一个32字节的token。

应用开发者要推送通知到用户的设备时，把消息和token一起发送给APN服务器，APN服务器根据token来将消息发送到用户的设备上。

本文主要介绍如何通过Openssl来将推送消息发送到APN服务器，有关Apple Push Notification的更多内容可以参考[官方文档](http://developer.apple.com/library/mac/#documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/ApplePushService/ApplePushService.html)。 

### 1. 准备工作

需要支持推送的应用必须要有一个独立的App ID(不带*号的)。并且要在配置里打开Push Notification这一项，配置成功后会有两个用于发送推送通知时使用的Certificate，分别在Development和Production环境下使用，开发阶段使用Development的证书，连接测试的APN服务器，两者之间不能混用。

将两个证书都导入钥匙串，然后从钥匙串中连Key和证书一起导出到p12文件。再将p12文件转换成PEM文件。

```shell
# 将p12证书转换为pem
openssl pkcs12 -in development.p12 -out development.pem -nodes
```

Xcode中应用的 Bundle Identifier 必须与 App ID 相符，并且，还需要创建一个新的与App ID相符的Provisioning Profile，应用的Code Signing要选择这个Profile才行。

### 2. 获取设备token

```objc
// 修改AppDelegate.m
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{  
    // 在这里添加以下几行，请求允许通知
    [[UIApplication sharedApplication]
     registerForRemoteNotificationTypes:(UIRemoteNotificationTypeAlert |
                                         UIRemoteNotificationTypeBadge |
                                         UIRemoteNotificationTypeSound)];

    return YES;
}

// 成功的话会在这里返回得到的token
- (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken
{
    
    NSString *str = [[[NSString stringWithFormat:@"%@", deviceToken]
                      stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@"<>"]]
                     stringByReplacingOccurrencesOfString:@" " withString:@""];
    NSLog(@"token: %@", str,);
}

// 失败时会调用这里
- (void)application:(UIApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
{
    NSLog(@"register for remote notification Error: %@", error);
}

// 当收到推送消息时会调用这里。
- (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo
{
    
}
```

### 3. 建立SSL连接，发送推送消息

#### 3.1 初始化SSL

```cpp
// 初始化ssl库，Windows下初始化WinSock
void init_openssl()
{
#ifdef _WIN32
    WSADATA wsaData;
    WSAStartup(MAKEWORD(2, 2), &wsaData);
#endif

    SSL_library_init();
    ERR_load_BIO_strings();
    SSL_load_error_strings();
    OpenSSL_add_all_algorithms();
}
```

#### 3.2 连接服务器

苹果提供了两个服务器：**gateway.push.apple.com:2195**—用于正式服务，**gateway.sandbox.push.apple.com:2195**—用于测试服务。我们在测试的时候使用测试服务器，应用正式发布后使用正式服务器。

首先，建立TCP连接。

```cpp
int tcp_connect(const char* host, int port)
{
    struct hostent *hp;
    struct sockaddr_in addr;
    int sock = -1;

    // 解析域名 
    if (!(hp = gethostbyname(host))) {
        return -1;
    }

    memset(&addr, 0, sizeof(addr));
    addr.sin_addr = *(struct in_addr*)hp->h_addr_list[0];
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);

    if ((sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP)) < 0){
        return -1;
    }

    if (connect(sock, (struct sockaddr*)&addr, sizeof(addr)) != 0) {
        return -1;
    }

    return sock;
}
```

第二步，要用我们的证书和Key创建SSL Context，并用SSL_connect实现与服务器的握手

```cpp
// 创建SSL Context
SSL_CTX* init_ssl_context(
        const char* clientcert,                 /* 客户端的证书 */
        const char* clientkey,                  /* 客户端的Key */
        const char* keypwd,                     /* 客户端Key的密码, 如果有的话 */
        const char* cacert)                     /* 服务器CA证书 如果有的话 */
{
    // set up the ssl context
    SSL_CTX *ctx = SSL_CTX_new(SSLv23_client_method());
    if (!ctx) {
        return NULL;
    }

    // certificate
    if (SSL_CTX_use_certificate_file(ctx, clientcert, SSL_FILETYPE_PEM) <= 0) {
        return NULL;
    }

    // key
    if (SSL_CTX_use_PrivateKey_file(ctx, clientkey, SSL_FILETYPE_PEM) <= 0) {
        return NULL;
    }

    // make sure the key and certificate file match
    if (SSL_CTX_check_private_key(ctx) == 0) {
        return NULL;
    }

    // load ca if exist
    if (cacert) {
        if (!SSL_CTX_load_verify_locations(ctx, cacert, NULL)) {
            return NULL;
        }
    }

    return ctx;
}

// 实现SSL握手，建立SSL连接
SSL* ssl_connect(SSL_CTX* ctx, int socket)
{
    SSL *ssl = SSL_new(ctx);
    BIO *bio = BIO_new_socket(socket, BIO_NOCLOSE);
    SSL_set_bio(ssl, bio, bio);

    if (SSL_connect(ssl) <= 0) {
        return NULL;
    }

    return ssl;
}
```

第三步，建立SSL连接成功后，说明服务器认可了我们的证书，我们还需要验证一下服务器的证书是不是正确

```cpp
// 验证服务器证书
// 首先要验证服务器的证书有效，其次要验证服务器证书的CommonName(CN)与我们
// 实际要连接的服务器域名一致
int verify_connection(SSL* ssl, const char* peername)
{
    int result = SSL_get_verify_result(ssl);
    if (result != X509_V_OK) {
        fprintf(stderr, "WARNING! ssl verify failed: %d", result);
        return -1;
    }

    X509 *peer;
    char peer_CN[256] = {0};

    peer = SSL_get_peer_certificate(ssl);
    X509_NAME_get_text_by_NID(X509_get_subject_name(peer), NID_commonName, 
                              peer_CN, 255);
    if (strcmp(peer_CN, peername) != 0) {
        fprintf(stderr, "WARNING! Server Name Doesn't match, got: %s, required: %s", peer_CN,
            peername);
    }
    return 0;
}
```

#### 3.3 打包要发送的消息

发送的推送消息有两种格式，这里做简单介绍，具体的可见 [苹果的文档](http://developer.apple.com/library/mac/#documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/CommunicatingWIthAPS/CommunicatingWIthAPS.html#//apple_ref/doc/uid/TP40008194-CH101-SW1)

![img](/img/posts/2012121419312324.jpg)

第一种形式，比较简单，Command占一个字节长度，必须是0，Token length是设备号的长度，现在是32，Device Token是二进制的，需要把我们前面获得的字符串转换成二进制，Payload length是Payload的长度，根据Payload的长度变化，Payload部分，最多256个字节，是JSON格式的内容，不能以'\0'结尾，如果有中文的话，需要是UTF-8编码，(关于Payload可以看这里， [“The Notification Payload”](http://developer.apple.com/library/mac/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/ApplePushService/ApplePushService.html#//apple_ref/doc/uid/TP40008194-CH100-SW1)).

![img](/img/posts/2012121419314027.jpg)

第二种形式比第一种形式增加了，Identifier和Expiry, Identifier是我们自定义的消息编号，如果我们发送的消息有错误，比如token无效，或者格式错误等，服务器会把这个Identifier返回给我们并返回错误码，需要注意的是如果发送成功，服务器不会给任何回应。Expiry是一个UNIX格式的时间，用来表示消息过期的时间，比如一天的过期的时间可以写成 (time(NULL) + 24 * 3600)。

![img](/img/posts/2012121419503320.jpg)

如果发送失败，服务器会给我们回应上面格式的数据包，Identifier是我们发送的指定的编号，也就是说只有第二种形式发送的时间服务器才会给回应。

由于涉及Payload的编码，这部分代码较长，这里只给出部分片断，详细的可参阅完整代码。

```cpp
// 第一种形式的包
int build_output_packet(char* buf, int buflen,  /* 输出的缓冲区及长度 */
        const char* tokenbinary,                /* 二进制的Token */
        const char* msg,                        /* 要发送的消息 */ 
        int badage,                             /* 应用图标上显示的数字 */
        const char * sound)                     /* 设备收到时播放的声音，可以为空 */
{
    assert(buflen >= 1 + 2 + TOKEN_SIZE + 2 + MAX_PAYLOAD_SIZE);
    char * pdata = buf;
    // command
    *pdata = 0;

    // token length
    pdata++;
    *(uint16_t*)pdata = htons(TOKEN_SIZE);

    // token binary
    pdata += 2;
    memcpy(pdata, tokenbinary, TOKEN_SIZE);

    pdata += TOKEN_SIZE;

    int payloadlen = MAX_PAYLOAD_SIZE;
    if (build_payload(pdata + 2, payloadlen, msg, badage, sound) < 0) {
        std::string strmsg(msg);
        strmsg.erase(strmsg.length() - (payloadlen - MAX_PAYLOAD_SIZE));
        payloadlen = MAX_PAYLOAD_SIZE;
        if (build_payload(pdata + 2, payloadlen, msg, badage, sound) <= 0) {
            return -1;
        }
    }
    *(uint16_t*)pdata = htons(payloadlen);

    return 1 + 2 + TOKEN_SIZE + 2 + payloadlen;
}  

// 第二种形式的包
int build_output_packet_2(char* buf, int buflen, /* 缓冲区及长度 */
        uint32_t messageid,                     /* 消息编号 */
        uint32_t expiry,                        /* 过期时间 */
        const char* tokenbinary,                /* 二进制Token */
        const char* msg,                        /* message */
        int badage,                             /* badage */
        const char * sound)                     /* sound */
{
    assert(buflen >= 1 + 2 + 4 + 4 + TOKEN_SIZE + 2 + MAX_PAYLOAD_SIZE);

    char * pdata = buf;
    // command
    *pdata = 1;

    // messageid
    pdata++;
    *(uint32_t*)pdata = messageid;

    // expiry time
    pdata += 4;
    *(uint32_t*)pdata = htonl(expiry);

    // token length
    pdata += 4;
    *(uint16_t*)pdata = htons(TOKEN_SIZE);

    // token binary
    pdata += 2;
    memcpy(pdata, tokenbinary, TOKEN_SIZE);

    pdata += TOKEN_SIZE;

    int payloadlen = MAX_PAYLOAD_SIZE;
    if (build_payload(pdata + 2, payloadlen, msg, badage, sound) < 0) {
        std::string strmsg(msg);
        strmsg.erase(strmsg.length() - (payloadlen - MAX_PAYLOAD_SIZE));
        payloadlen = MAX_PAYLOAD_SIZE;
        if (build_payload(pdata + 2, payloadlen, msg, badage, sound) <= 0) {
            return -1;
        }
    }
    *(uint16_t*)pdata = htons(payloadlen);

    return 1 + 4 + 4 + 2 + TOKEN_SIZE + 2 + payloadlen;
}
```

发送消息

```cpp
int send_message(SSL *ssl, const char* token, const char* msg, 
                 int badage, const char* sound)
{
    char buf[1 + 2 + TOKEN_SIZE + 2 + MAX_PAYLOAD_SIZE];
    int buflen = sizeof(buf);

    buflen = build_output_packet(buf, buflen, 
            (const char*)DeviceToken2Binary(token).binary(), 
            msg, badage, sound);
    if (buflen <= 0) {
        return -1;
    }

    return SSL_write(ssl, buf, buflen);
}

int send_message_2(SSL *ssl, const char* token, uint32_t id, uint32_t expire, 
        const char* msg, int badage, const char* sound)
{
    char buf[1 + 4 + 4 + 2 + TOKEN_SIZE + 2 + MAX_PAYLOAD_SIZE];
    int buflen = sizeof(buf);

    buflen = build_output_packet_2(buf, buflen, id, expire, 
            (const char*)DeviceToken2Binary(token).binary(), msg, badage, sound);
    if (buflen <= 0) {
        return -1;
    }

    return SSL_write(ssl, buf, buflen);
}
```

#### 3.4 完整使用

```cpp
    init_openssl();

    // 初始化Context
    // develop.pem是我们的证书和Key，为了方便使用，我们把证书和Key写到同一个文件中
    // 并取消了Key的密码保护 
    // entrust_2048_ca.pem是苹果证书的CA，它并不在Openssl的根证书中，
    // 所以需要我们手动指定，不然会无法验证
    // 详细：http://www.entrust.net/developer/index.cfm
    SSL_CTX *ctx = init_ssl_context("develop.pem", "develop.pem", NULL, "entrust_2048_ca.pem");
    if (!ctx) {
        fprintf(stderr, "init ssl context failed: %s\n",
                ERR_reason_error_string(ERR_get_error()));
        return -1;
    }

    // 连接到测试服务器
    const char* host = "gateway.sandbox.push.apple.com";
    const int port = 2195;
    int socket = tcp_connect(host, port);
    if (socket < 0) {
        fprintf(stderr, "failed to connect to host %s\n",
                strerror(errno));
        return -1;
    }

    // SSL连接
    SSL *ssl = ssl_connect(ctx, socket);
    if (!ssl) {
        fprintf(stderr, "ssl connect failed: %s\n",
                ERR_reason_error_string(ERR_get_error()));
        Closesocket(socket);
        return -1;
    }
    // 验证服务器证书
    if (verify_connection(ssl, host) != 0) {
        fprintf(stderr, "verify failed\n");
        Closesocket(socket);
        return 1;
    }

    uint32_t msgid = 1;
    uint32_t expire = time(NULL) + 24 * 3600;   // expire 1 day

    // 发送一条消息
    const char* token = "0a8b9e7cbe68616cd5470e4c8abb4c1a3f4ba2bee4ca113ff02ae2c325948b8a";
    if (send_message_2(ssl, token, msgid++, expire,
                "Hello, This is a push message", 1, "default") <= 0) {
        fprintf(stderr, "send failed: %s\n",
            ERR_reason_error_string(ERR_get_error()));
    }

    // 关闭连接
    SSL_shutdown(ssl);
    Closesocket(socket);
```

### 4. 总结

本例中，只演示了发送消息，而没有实现服务器返回数据的接收，实际应用中如果服务器返回错误后，连接会断开，这时候需要重新连接来发送其它的消息，另外，还应该注意，尽量将多个消息放到一个连接里发送，与服务器保持长连接，不能发一个消息连接一次，连接过于频繁，服务器可能会把你的IP暂时禁掉。

在设备上获得Token,开发环境下和从App Store下载正式的应用，获得的Token是一样的，而且这个Token一旦在测试环境下使用了，就无法再从正式服务器上推送消息了，会返回Token无效，除非把手机还原了，不然无法从正式服务器上推送消息。

本例的代码放在这里。[https://github.com/e7868a/apple-push-notify](https://github.com/e7868a/apple-push-notify)

编译：
```shell
gcc src/push.cpp -o push -lssl -lcrypto -lstdc++
```
