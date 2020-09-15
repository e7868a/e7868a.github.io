---
title: OpenSSL Cheat Sheet
category: 系统运维
---

OpenSSL 是 SSL 和 TLS 的开源实现，常用于身份验证、数据加密等场景中，本文介绍 OpenSSL 的常用命令。

### 生成证书

要使用 OpenSSL 我们必须先要有自己的数字证书。数字证书一般要向专业的认证公司(如VeriSign)申请，并且都是收费的，某些情况下，我们只是想使用加密的数据通信，而不在乎认证，这时就可以自己制作一个证书。自己制作一个证书，有两种方式，一种是自己签发 Self Signed 的证书，另一种也是 Self Signed 的证书，不过先制作一个 CA，然后由这个 CA 来发布我们需要的证书。下面分别介绍这两个方法。

#### 生成 Self Signed 证书

```shell
# STEP 1: 生成一个key，你的私钥,openssl会提示你输入一个密码，可以输入，也可以不输，
# 输入的话，以后每次使用这个key的时候都要输入密码，安全起见，还是应该有一个密码保护
openssl genrsa -des3 -out selfsign.key 4096

# STEP 2: 使用上面生成的key，生成一个certificate signing request (CSR)
# 如果你的key有密码保护，openssl首先会询问你的密码，然后询问你一系列问题，
# 其中Common Name(CN)是最重要的，它代表你的证书要代表的目标，如果你为网站申请的证书，
# 就要添你的域名。
openssl req -new -key selfsign.key -out selfsign.csr

# STEP 3: 生成Self Signed证书 selfsign.crt 就是我们生成的证书了
openssl x509 -req -days 365 -in selfsign.csr -signkey selfsign.key -out selfsign.crt

# 另外一个比较简单的方法就是用下面的命令，一次生成key和证书
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout privateKey.key \
  -out certificate.crt
```

#### 生成自己的 CA (Certificate Authority)

CA 是证书的发布者，CA 可以发布其他人的证书，把 CA 的证书加入系统信任的根证书后，由 CA 发布的证书也被系统所信任，所以，CA 的 key 是必须小心保护的，一般都要加密保护，并且限制为 root 权限读写。

```shell
# 生成CA的key
openssl genrsa -des3 -out ca.key 4096

# 生成CA的证书
openssl req -new -x509 -days 365 -key ca.key -out ca.crt

# 生成服务器的key和CSR，这两步与上面Self Signed中 STEP1 和 STEP2 是一样的
openssl genrsa -des3 -out myserver.key 4096
openssl req -new -key myserver.key -out myserver.csr

# 使用ca的证书和key，生成服务器的证书
# 这里的set_serial指明了证书的序号，如果证书过期了(365天后)，
# 或者证书key泄漏了，需要重新发证的时候，就要加1
openssl x509 -req -days 365 -in myserver.csr -CA ca.crt -CAkey ca.key -set_serial 01 \
 -out myserver.crt
```

### 查看证书

```shell
# 查看KEY信息
openssl rsa -noout -text -in myserver.key

# 查看CSR信息
openssl req -noout -text -in myserver.csr

# 查看证书信息
openssl x509 -noout -text -in ca.crt

# 验证证书
# 会提示self signed
openssl verify selfsign.crt

# 因为myserver.crt 是由 ca.crt 发布的，所以会验证成功
openssl verify -CAfile ca.crt myserver.crt
```

### 去掉key的密码保护

有时候每次都要输入密码太繁琐了,可以把Key的保护密码去掉

```shell
openssl rsa -in myserver.key -out server.key.insecure
```

### 不同格式证书的转换

一般证书有三种格式：

- PEM(.pem) 前面命令生成的都是这种格式，
- DER(.cer .der) Windows 上常见
- PKCS#12文件(.pfx .p12) Mac上常见

```shell
# PEM转换为DER
openssl x509 -outform der -in myserver.crt -out myserver.der

# DER转换为PEM
openssl x509 -inform der -in myserver.cer -out myserver.pem

# PEM转换为PKCS
openssl pkcs12 -export -out myserver.pfx -inkey myserver.key -in myserver.crt \
 -certfile ca.crt

# PKCS转换为PEM
openssl pkcs12 -in myserver.pfx -out myserver2.pem -nodes
```

### 测试证书

Openssl提供了简单的client和server工具，可以用来模拟SSL连接，做测试使用。

```shell
# 连接到远程服务器
openssl s_client -connect www.google.com.hk:443

# 模拟的HTTPS服务，可以返回Openssl相关信息 
# -accept 用来指定监听的端口号 
# -cert -key 用来指定提供服务的key和证书
openssl s_server -accept 443 -cert myserver.crt -key myserver.key -www

# 可以将key和证书写到同一个文件中
cat myserver.crt myserver.key > myserver.pem
# 使用的时候只提供一个参数就可以了
openssl s_server -accept 443 -cert myserver.pem -www

# 将服务器的证书保存下来
openssl s_client -connect www.google.com.hk:443 </dev/null | sed -ne \
 '/-BEGIN CERTIFICATE-/,/-END CERTIFICATE-/p' > remoteserver.pem
# 转换成DER文件，就可以在Windows下直接查看了
openssl x509 -outform der -in remoteserver.pem -out remoteserver.cer
```

### 计算文件的 MD5 和 SHA1

```bash
# MD5 digest
openssl dgst -md5 filename

# SHA1 digest
openssl dgst -sha1 filename
```