---
title: 自动清理 Nexus 中的过期镜像
category: 系统运维
---

### 自动清理过期镜像

Nexus Repository 是一款非常好用的私有仓库，支持 Maven、Docker、Yum、PyPi等等，基本主流的类型都支持。自从使用了持续集成以后，我们会自动对新代码进行编译打包发布到开发环境中，以便尽快地对新代码进行测试。这样导致的问题就是 Nexus 中的 Docker 库占用的空间越来越大。Nexus 本身提供了 Cleanup 功能，可以将一段时间之前的镜像删除，但是如果全部按过期时间去删除，会导致一些长时间以前上传，但是还需要使用的镜像也删除。

幸运的是，Nexus 支持基于 Groovy 的 Script 功能，可以自己编写 Script 来实现不同的功能。这里提供一个小脚本，可以按更新时间清理过期的镜像，同时还可以选择保留最近的几个镜像，不会把历史镜像全部删除。我们目前的 Tag 命名规则，是 `{COMMITID}-(prod|test|dev)-{BUILD_NUMBER}`，COMMITID 对应构建镜像时代码库的 COMMITID 取前8位， prod、test、dev则对应不用的部署环境，生产环境、测试环境、开发环境等。如果是 Jenkins 构建的，还会加上 BUILD_NUMBER。清理脚本的逻辑就是把每一个应用的所有镜像按 prod、test、dev 分别按修改时间进行排序，保留最新的 5 个，把其它的都删除。代码如下：

```groovy
import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import org.sonatype.nexus.repository.storage.Component
import org.sonatype.nexus.repository.storage.Query
import org.sonatype.nexus.repository.storage.StorageFacet

def request = new JsonSlurper().parseText(args)
assert request.repoName: 'repoName parameter is required'
// tag filter
if (!request.filter) {
    request.filter = ["test-", "dev-", "prod-"]
}
// should delete or not
if (!request.delete) {
    request.delete = false
}

def result = [:]
def repoName = request.repoName
def keepSize = 5

def repo = repository.repositoryManager.get(repoName)
def tx = repo.facet(StorageFacet).txSupplier().get()

try {
    tx.begin()
    def components = tx.findComponents(Query.builder().where('1').eq(1).build(), [repo])
    components.each { Component cmp ->
        def version = cmp.version()
        for (String matchTag in request.filter) {
            if (version =~ matchTag) {
                result.get(cmp.name(),[:]).get(matchTag,[]).add(cmp)
                break
            }
        }
    }
    tx.commit()
} catch (Exception e) {
    log.warn("Transaction failed {}", e.toString())
    tx.rollback()
} finally {
    tx.close()
}

def deleted = []
for (groups in result) {
    for (components in groups.value) {
        List<Component> items = components.value as List<Component>
        if (items.size() <= keepSize) {
            continue
        }

        def sorted = items.sort { a, b ->
            def a_updated = a.getEntityMetadata().getDocument().field('last_updated')
            def b_updated = b.getEntityMetadata().getDocument().field('last_updated')
            return a_updated.compareTo(b_updated)
        }
        def toDelete = sorted[0..-(keepSize + 1)]
        for (Component c in toDelete) {
            deleted.add("${c.name()}:${c.version()}")
            if (request.delete) {
                def tx_del = repo.facet(StorageFacet).txSupplier().get()
                try {
                    tx_del.begin()
                    tx_del.deleteComponent(c)
                    tx_del.commit()
                } catch (Exception e) {
                    log.warn("Delete Component failed {}", e.toString())
                    tx_del.rollback()
                } finally {
                    tx_del.close()
                }
            }
        }
    }
}

return JsonOutput.toJson(deleted)
```
### 运行 Script

写好的脚本需要上传到 Nexus 并执行。这里推荐使用 [nexus3-cli](https://gitlab.com/thiagocsf/nexus3-cli) 来操作 Nexus。下面只列出 Script 相关的操作，nexus3-cli 的详细功能可参考官方文档 [https://nexus3-cli.readthedocs.io/en/latest/index.html](https://nexus3-cli.readthedocs.io/en/latest/index.html)。

```console
           # 安装 nexus3-cli
foo@bar:~$ pip install nexus3-cli

           # 登陆到 nexus
foo@bar:~$ nexus3 login --url http://your-nexus-url

           # 将上面的脚本保存为 removeOutdateComponents.groovy 然后上传
foo@bar:~$ nexus3 script create remove-outdate-components removeOutdateComponents.groovy

           # 查看会被删除的镜像，但并不删除
foo@bar:~$ nexus3 script run remove-outdate-components -a \
            '{"repoName":"your-hosted-docker-repoName"}'

           # 删除过期镜像并返回
foo@bar:~$ nexus3 script run remove-outdate-components -a \
            '{"repoName":"your-hosted-docker-repoName","delete":true}'
```