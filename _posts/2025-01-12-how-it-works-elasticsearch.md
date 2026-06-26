---
title: How it works - Elasticsearch
category: 系统运维
---

### Elasticsearch 是什么

Elasticsearch 是一个分布式搜索和分析引擎。很多人第一次接触它，是因为 ELK 日志系统：应用把日志写入 Elasticsearch，然后用 Kibana 查询和分析。但 Elasticsearch 并不只是一个日志库，它更准确的定位是：把文档数据组织成适合搜索、过滤、排序和聚合的数据结构，并把这些结构分布到多台机器上。

虽然 Elasticsearch 也可以被看作一种数据库，但它并不适合作为通用数据库来使用。它的核心能力来自面向搜索和分析设计的索引、分片与聚合机制，因此在建模和使用时，更应该围绕检索效率、数据冗余和近实时分析来思考，而不是套用关系型数据库的事务和范式思路。

换句话说，Elasticsearch 最擅长的是“为查询而组织数据”，而不是“像数据库一样保存一切”。业务事实更适合保存在关系型数据库、KV 存储、文档数据库或事件流中，Elasticsearch 作为同步过来的查询视图和分析视图存在。

### 基本架构

#### Document、Index 与 Mapping

Elasticsearch 中最基本的数据单位是 `document`。一个 document 通常是一段 JSON，例如：

```json
{
  "id": "order-10001",
  "user_id": 42,
  "status": "paid",
  "message": "payment completed",
  "created_at": "2026-06-24T10:00:00+08:00"
}
```

一组结构相近的 document 会被写入同一个 `index`。从使用者角度看，index 有点像关系型数据库中的表，但这个类比并不严格。关系型数据库主要围绕行、列、事务和关系建模，而 Elasticsearch 主要围绕搜索建模：每个字段如何被索引，是否参与全文检索，是否用于排序和聚合，都会影响底层存储结构。

这些字段规则由 `mapping` 定义。官方文档中对 mapping 的定义很直接：它决定 document 及其字段如何被存储和索引。mapping 中最常见的类型包括：

- `text`：用于全文检索，会经过 analyzer 分词。
- `keyword`：用于精确匹配、排序、聚合，一般不会分词。
- `long`、`integer`、`double`、`scaled_float`：用于数值查询和聚合。
- `date`：用于时间范围查询。
- `object`、`nested`：用于嵌套结构。
- `geo_point`、`geo_shape`：用于地理位置检索。

Elasticsearch 支持 dynamic mapping，也就是根据写入文档自动推断字段类型。这让上手很容易，但在生产环境中往往不是好事。字段类型一旦推断错了，后续通常不能直接修改，只能新建索引并 reindex。

> **NOTE**：为什么 Elasticsearch 里叫 `mapping`，而不是像数据库那样叫“字段类型”或 schema？
>
> 因为 Elasticsearch 里的数据**是为检索而生的**，不是为保存而存的。一个字段除了值的类型，还有一整套索引结构要决定：同一个字符串可选 `text`（分词检索）或 `keyword`（精确聚合），甚至 multi-field 两份都存；数值字段还能选是否启用 doc values。数据库的字段类型描述的是“怎么存”，mapping 描述的是“怎么被检索”——即“原始字段 → 索引结构”这层映射关系。
{:.note}

#### Cluster、Node、Shard 与 Replica

Elasticsearch 是分布式系统，一个集群称为 `cluster`，集群中的每个进程称为 `node`。一个 index 不会直接作为一个整体放在某台机器上，而是会被拆成多个 `shard`。

shard 是 Elasticsearch 扩展能力的核心。每个 shard 本质上都是一个完整的 Lucene index，保存 index 中一部分 document。多个 shard 分布在不同 node 上，写入和查询就可以并行执行。

shard 分为两类：

- `primary shard`：主分片，每个 document 一定属于某一个 primary shard。
- `replica shard`：副本分片，是 primary shard 的拷贝，用于高可用和提升读取吞吐。

假设一个 index 有 3 个 primary shard，每个 primary shard 有 1 个 replica，那么整个 index 会有 6 个 shard copy。

```text
index: orders

primary shard:   P0   P1   P2
replica shard:   R0   R1   R2
```

primary shard 的数量在 index 创建时确定，后续不能像 replica 那样随意修改。可以通过 split、shrink、reindex 等方式调整，但都不是简单的在线改配置。因此，shard 数量是一个需要提前规划的问题。

![Elasticsearch cluster node shard replica architecture](img/posts/elasticsearch-cluster-shard-replica-architecture.svg)

#### Elasticsearch 与 Lucene 的关系

Elasticsearch 的底层搜索能力来自 Apache Lucene。可以粗略理解为：

```text
Elasticsearch = 分布式系统 + REST API + 集群管理 + 查询 DSL + Lucene
```

Lucene 负责单机上的倒排索引、评分、排序、segment 合并等核心搜索能力；Elasticsearch 负责把多个 Lucene index 组织成一个分布式集群，并提供更容易使用的 API。

因此，理解 Elasticsearch 的关键，是同时理解两层：

- 在单个 shard 内，Lucene 如何存储和检索数据。
- 在集群层面，Elasticsearch 如何路由、复制和合并结果。

![Elasticsearch lucene architecture](img/posts/elasticsearch-cluster-lucene-architecture.svg)

### Elasticsearch 工作原理

理解 Elasticsearch 工作原理最清晰的方式，是跟着数据走一遍：先看数据如何被组织和存储，再看一条文档如何被写入并最终持久化，最后看一次查询如何被执行。这三段顺下来，恰好对应 Lucene 与 Elasticsearch 各自职责的分界线。

#### 存储层：数据如何被组织

##### (1) 倒排索引

全文搜索的核心数据结构是倒排索引（Inverted Index）。

如果我们有三条文档：

```text
doc1: elasticsearch is fast
doc2: lucene is powerful
doc3: elasticsearch uses lucene
```

普通的正向存储是：

```text
doc1 -> elasticsearch, is, fast
doc2 -> lucene, is, powerful
doc3 -> elasticsearch, uses, lucene
```

倒排索引则反过来：

```text
elasticsearch -> doc1, doc3
lucene        -> doc2, doc3
is            -> doc1, doc2
fast          -> doc1
powerful      -> doc2
uses          -> doc3
```

当用户搜索 `elasticsearch lucene` 时，搜索引擎不需要逐条扫描所有 document，只要在倒排索引中找到对应 term 的 posting list，然后做合并、打分和排序。

倒排索引不仅保存 term 到 document 的关系，还可能保存词频、位置、offset 等信息。词频影响相关性评分；位置可以支持短语查询；offset 可以支持高亮。保存的信息越多，搜索能力越强，但磁盘占用和写入成本也越高。

##### (2) Analyzer：写入时和查询时都可能分词

`text` 字段在写入时会经过 analyzer。analyzer 通常包括三个步骤：

1. character filter：在分词前处理原始字符，例如去除 HTML。
2. tokenizer：把文本切成 token。
3. token filter：对 token 做小写化、停用词过滤、同义词处理、词干提取等。

例如：

```text
"The Quick Brown Foxes"
```

经过 analyzer 后，可能变成：

```text
quick, brown, fox
```

这就是为什么 `match` 查询和 `term` 查询不同。

`match` 查询会对查询文本做分析，然后拿分析后的 term 去倒排索引中查。`term` 查询不会分析输入，它要求字段中存在完全相同的 term。因此，在 `text` 字段上使用 `term` 查询，经常会得到看似奇怪的结果。

例如，字段 `message` 是 `text` 类型，写入：

```json
{ "message": "Payment Completed" }
```

如果 analyzer 把内容转成小写 token，那么倒排索引中可能是：

```text
payment, completed
```

这时：

```json
{ "term": { "message": "Payment Completed" } }
```

通常匹配不到，而：

```json
{ "match": { "message": "Payment Completed" } }
```

可以匹配到。

如果业务需要精确匹配，应该使用 `keyword` 字段：

```json
{
  "mappings": {
    "properties": {
      "status": { "type": "keyword" },
      "message": {
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      }
    }
  }
}
```

上面的 `message.keyword` 就是 multi-field。它让同一个字段既可以按 `text` 做全文检索，也可以按 `keyword` 做精确匹配、排序和聚合。

##### (3) Doc Values

倒排索引适合回答“哪些 document 包含这个 term”。但排序、聚合、脚本计算经常需要回答另一个问题：“这个 document 的某个字段值是什么”。

如果按照倒排索引的结构去做排序，会很不自然。比如要按 `created_at` 排序，搜索引擎需要快速拿到每个命中文档的 `created_at` 值。为了解决这类问题，Elasticsearch 使用 Lucene 的 `doc values`。

doc values 可以理解为面向列的磁盘结构：

```text
doc1 -> created_at = 2026-06-24T10:00:00
doc2 -> created_at = 2026-06-24T10:01:00
doc3 -> created_at = 2026-06-24T10:02:00
```

对于 `keyword`、数值、日期、布尔、IP 等字段，doc values 默认开启。排序和聚合通常依赖 doc values，而不是从 `_source` 中临时解析字段。

这也解释了一个常见现象：一个字段如果主要用于聚合和排序、很少用于过滤，可以关闭 `index`，但保留 doc values。对支持 doc values 的字段来说，这类 doc-value-only 查询仍然可以执行，只是比走常规索引结构慢，更适合低频查询。

```json
{
  "mappings": {
    "properties": {
      "cost": {
        "type": "long",
        "index": false
      }
    }
  }
}
```

##### (4) `_source`、stored fields 与 index

Elasticsearch 默认会保存原始 JSON 到 `_source` 字段。查询命中文档后，返回给客户端的 JSON 通常来自 `_source`。

这里需要区分三件事：

- `index`：字段是否建立可搜索的索引结构。
- `doc_values`：字段是否建立适合排序和聚合的列式结构。
- `_source`：是否保存原始 JSON。

这三者不是一回事。

如果关闭某字段的 `index`，它不再建立常规搜索索引；字段仍可能存在于 `_source` 中，部分支持 doc values 的字段也还能低效查询。
如果关闭 `_source`，可以节省磁盘，但 update、reindex、高亮等功能会受影响。
如果对 `text` 字段做聚合，Elasticsearch 可能需要 fielddata，把倒排索引临时加载成面向列的结构，这通常会大量消耗 heap。

因此，生产环境中不要随手关闭 `_source`，也不要在 `text` 字段上直接做排序或聚合。真正需要聚合的字符串字段，应该使用 `keyword`。

##### (5) Segment：不可变的小索引

Lucene 不会把每次写入都直接改到一个巨大的索引文件里。它会先在内存 buffer 中接收文档，然后周期性地生成新的 segment。

segment 可以理解为一个小型的、不可变的倒排索引。一个 shard 由多个 segment 组成：

```text
shard
  segment_1
  segment_2
  segment_3
```

segment 一旦写入，就不会原地修改。新增 document 会进入新的 segment；删除 document 会被标记为删除；更新 document 本质上是删除旧版本再新增新版本。

不可变 segment 带来了几个好处：

- 读操作可以更简单，segment 不会被并发修改。
- segment 可以被文件系统缓存高效缓存。
- 多个小 segment 可以后台 merge 成更大的 segment。

但它也带来成本：

- 更新和删除不会立刻释放磁盘。
- segment 太多会增加搜索时的开销。
- merge 会消耗 I/O、CPU 和磁盘空间。

这就是为什么频繁 update/delete 的 Elasticsearch 集群容易出现性能波动，也为什么 force merge 只适合只读索引。

#### 写入流程：一条文档如何被持久化

##### (1) 路由到 Shard

写入 document 时，Elasticsearch 需要先决定它属于哪个 primary shard。默认情况下，路由值来自 `_id`，计算方式可以理解为：

```text
shard = hash(_routing) % number_of_primary_shards
```

如果没有显式指定 `_routing`，通常使用 `_id`。这意味着同一个 `_id` 的 document 会稳定落到同一个 shard 上。

自定义 routing 有时很有用，比如多租户系统希望同一个 tenant 的数据落在固定 shard，查询时也带上 routing，从而避免查询所有 shard。

但 routing 也很危险。如果某个 tenant 特别大，就会形成热点 shard。热点 shard 无法靠增加 node 自动拆开，因为 shard 是基本执行单位。

##### (2) Primary-Backup 复制模型

Elasticsearch 的写入复制模型是 primary-backup。

一个写入请求到达任意 node 后，这个 node 成为 coordinating node。它根据 routing 找到目标 primary shard，并把请求转发过去。primary shard 先执行本地写入和校验，然后把操作并行转发给 in-sync replicas。所有需要同步的 replica 成功后，primary 才向客户端确认写入成功。

```text
client
  -> coordinating node
  -> primary shard
     -> replica shard 1
     -> replica shard 2
  <- ack
```

这个模型有两个重要影响：

第一，写入延迟受最慢的 in-sync replica 影响。一个慢 replica 可能拖慢整个 replication group。

第二，replica 不是免费的。增加 replica 可以提升读吞吐和可用性，但会增加写入成本、磁盘占用和网络复制成本。

##### (3) Refresh、Flush 与 Translog

Elasticsearch 经常被称为 near real-time search，也就是近实时搜索。原因在于：写入成功并不等于立刻可以被搜索到。

写入一个 document 时，大致流程如下：

```text
client
  -> coordinating node
  -> primary shard
  -> indexing buffer
  -> translog
  -> replica shard
  -> response
```

document 写入后，先进入内存中的 indexing buffer，同时操作会写入 translog。translog 类似预写日志，用于故障恢复。此时写入可以返回成功，但 document 还不一定对搜索可见。

当 refresh 发生时，buffer 中的数据会生成新的 segment，并打开给 searcher 使用。这个 segment 可能还在文件系统缓存中，不一定已经 fsync 到磁盘，但它已经可以被搜索。

默认情况下，Elasticsearch 每 1 秒 refresh 一次，但仅对过去 30 秒内收到过搜索请求的索引生效。没有搜索请求的索引不会自动 refresh，这也是批量导入场景在默认行为下就已经得到的优化。

flush 是另一件事。flush 会把 Lucene commit 落盘，并清理旧 translog。refresh 解决“能不能搜到”，flush 解决“崩溃后如何恢复”和“translog 不要无限增长”。

可以简单记：

```text
refresh: 让数据可搜索
flush:   提交 Lucene commit，截断 translog
merge:   合并 segment，清理删除标记，减少 segment 数量
```

![Elasticsearch write refresh flush merge flow](img/posts/elasticsearch-write-refresh-flow.svg)

##### (4) Update 不是原地更新

Elasticsearch 的 document 看起来可以 update：

```json
POST /orders/_update/order-10001
{
  "doc": {
    "status": "refunded"
  }
}
```

但底层 segment 是不可变的，所以 update 并不是原地修改某个字段。它大致等价于：

1. 找到旧 document。
2. 读取 `_source`。
3. 合并局部更新。
4. 标记旧 document 删除。
5. 写入新 document。

因此，Elasticsearch 不适合高频局部更新场景。如果一个字段每秒变化很多次，把它放进 Elasticsearch 往往会让 merge、refresh、translog 和复制都承受压力。

对于搜索系统，更合理的建模方式是：把 Elasticsearch 当作查询视图，而不是主存储。业务事实仍然保存在数据库或事件流中，Elasticsearch 保存面向检索的冗余模型。

#### 检索流程：一次查询如何被执行

这部分描述一次查询到达集群后，如何被拆分到多个 shard，再如何在两阶段（query / fetch）中被合并成最终结果。

##### (1) 查询先到 Coordinating Node

和写入一样，查询请求可以发送到任意 node。收到请求的 node 成为 coordinating node。它负责：

1. 解析请求。
2. 找到相关 shard。
3. 把 shard-level 查询发送给 primary 或 replica。
4. 收集每个 shard 的结果。
5. 合并排序后返回给客户端。

如果查询一个有 20 个 shard 的 index，理论上这次查询就可能被拆成 20 个 shard-level 查询。shard 越多，并行度越高，但协调、排队、合并的成本也越高。

这就是 oversharding 的根本问题：每个 shard 都有固定开销，过多 shard 会让一次普通查询变成大量小任务。

##### (2) Query Phase

Elasticsearch 的分布式搜索通常可以理解为两个阶段：query phase 和 fetch phase。

![Elasticsearch query fetch phase flow](img/posts/elasticsearch-search-query-fetch-flow.svg)

在 query phase 中，coordinating node 会把查询发给每个相关 shard。每个 shard 在本地执行查询，并维护一个优先队列，保存自己认为最靠前的 `from + size` 个结果。然后每个 shard 把轻量结果返回给 coordinating node，通常包括：

- doc id
- `_score`
- sort values

coordinating node 再把各个 shard 的 top results 合并成全局排序。

例如：

```json
GET /orders/_search
{
  "from": 90,
  "size": 10,
  "query": {
    "match": {
      "message": "payment completed"
    }
  }
}
```

如果这个 index 有 5 个 shard，每个 shard 都需要返回自己本地排序前 100 的轻量结果。coordinating node 收到后，再从最多 500 个候选中选出全局第 91 到第 100 条。

##### (3) Fetch Phase

query phase 只确定“哪些 document 排在前面”，还没有真正取回 `_source`。fetch phase 会根据全局排序结果，向相关 shard 发起 multi-get，取回最终需要返回的 document 内容。

```text
query phase:
  shard -> doc id + score + sort values

fetch phase:
  shard -> _source + highlight + fields
```

这解释了为什么深分页很危险。下面这个请求看起来只是想跳过前 1000 条，再取 20 条：

```json
{
  "from": 1000,
  "size": 20
}
```

即便只返回 20 条，每个 shard 也都得为它本地维护前 `1020` 个候选，coordinating node 还要把每个 shard 的候选合并成全局排序——`number_of_shards × 1020` 个候选里挑出最后那 20 条。`from` 越往后，维护与合并的代价就线性增长，把大量 CPU、内存和网络花在“最终被丢弃”的候选上，这是深分页的根本问题。

针对这种风险，Elasticsearch 自身有一道防护：`index.max_result_window`，默认 10000。`from + size` 超过该值的请求会在执行前被直接拒绝——它划定的就是 ES 认为“代价已不可接受”的上限。

突破它的正确方式不是调高这个值，而是改用 `search_after`。配合 point in time（PIT）和稳定排序翻页，后台全量扫描或重建索引类任务再考虑 scroll，而不是不断增加 `from`。

`search_after` 不需要从头维护前 N 个候选。它的工作方式像接力：每次请求带上“上一页最后一条的排序值”作为下一起点，每个 shard 只需从该点之后取 `size` 条（外加少量冗余），把结果推给协调节点合并。`from` 模式每次都是从 0 重新累加，而 `search_after` 的代价只和每次取的 `size` 有关，不随页码推进而增长。前提是：排序字段稳定且唯一；使用 PIT 时 Elasticsearch 会隐式追加 `_shard_doc` 作为 tie-breaker，否则需要自己提供稳定唯一的排序字段，避免漏取或重取。

##### (4) Query Context 与 Filter Context

Elasticsearch 查询中有两个常见语义：

- query context：关心相关性评分，例如 `match`。
- filter context：只关心是否匹配，例如 `term`、`range` 放在 `filter` 中。

例如：

```json
GET /orders/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "message": "payment completed" } }
      ],
      "filter": [
        { "term": { "status": "paid" } },
        { "range": { "created_at": { "gte": "now-7d/d" } } }
      ]
    }
  }
}
```

`must` 中的 `match` 会参与评分；`filter` 中的条件只判断是否匹配，通常更容易被缓存，也少了评分开销。

如果业务只是筛选，不需要相关性排序，应尽量使用 filter context。

##### (5) Aggregation

Elasticsearch 的 aggregation 用于统计分析，例如按状态计数：

```json
GET /orders/_search
{
  "size": 0,
  "aggs": {
    "by_status": {
      "terms": {
        "field": "status"
      }
    }
  }
}
```

aggregation 通常依赖 doc values。它很适合在搜索结果集上做统计，但不意味着可以无限制地当 OLAP 数据库使用。高基数字段上的 `terms` 聚合、复杂 nested 聚合、大范围时间聚合，都可能消耗大量内存和 CPU。

对于固定报表，常见优化方式是提前预聚合，或者在写入时增加适合聚合的冗余字段。例如把价格提前映射到价格区间，把 URL 解析成 host、path、method，把用户维度提前规范化。

### 逻辑部署与容量规划

很多性能问题不是查询写得不好，而是在建集群、规划 shard 阶段就埋下的。部署阶段的决策一旦定下就很难改——primary shard 数量创建后就不可在线修改，节点角色和 data tier 也决定了数据如何在硬件上流动。

#### 节点角色与 Data Tiers

Elasticsearch 集群由多个 node 组成，node 按角色分工：master 管集群元数据，data 扛读写负载，coordinating 负责请求调度，ingest 负责写入前预处理。规划部署就是决定“哪些角色放一起、各自配几台”，核心原则是让重负载彼此隔离，避免一种压力拖垮另一种。

##### (1) master 节点

维护集群状态（cluster state）、mapping 元数据、分片分配，本身不参与数据读写。一般生产环境中，集群要能容忍一台宕机，至少需要 3 个具备 master 资格的节点（2/3 才能形成多数派）。

对于**小集群、低负载**的场景：master 和 data 共用节点非常常见，官方的“mixed” / 多角色部署就是这种形态。几十个 shard 以内、cluster state 不大、没有高并发读写时，混合部署完全够用。

对于**较大集群或生产高可用**：建议拆出**专用 master**。原因是 cluster state 变更（mapping 增减、shard 分配、节点上下线）发生在 master 上，一旦 master 因为 data 角色的 GC、I/O 或 OOM 卡住，整个集群都会无法路由，连带查询和写入全部受影响。专用 master 把这种“致命的耦合”切断。

##### (2) data 节点

持有 shard，承担写入和查询的真正负载，是集群算力和存储的主要消耗者。data 节点的数量和规格直接决定集群容量，应优先按 shard 规划的结果（见下一节）来反推。data 节点通常优先使用本地盘或直连存储；远程/网络存储如果延迟高、随机 I/O 弱，会严重拖慢搜索和 merge，必须用真实负载压测后再采用。

##### (3) coordinating（协调节点）

严格说它不是一个独立角色，而是任意 node 都能承担的**职责**：解析请求、分发到 shard、合并结果。小集群里 data 节点兼任就够了；但**查询量大、聚合重、返回结果多**的场景，协调阶段本身会消耗大量 CPU 和内存（特别是 fetch phase 和深分页的合并队列），这些负载如果压在 data 节点上会和真正的 shard 计算抢资源。这时可以部署专用 coordinating-only 节点：给它们配齐 CPU 和内存，但不持有 shard、也不参与 master 或 ingest 等职责，典型配置是 `node.roles: []`，专职做请求调度和结果合并。

##### (4) ingest 节点

在文档写入前跑 ingest pipeline，做 grok 解析、字段 rename、enrich、geoip 等预处理。关键技术点：pipeline 只会在具备 `ingest` role 的节点上执行。客户端可以把 bulk 请求发到专用 ingest 节点，让它们完成预处理后再把写入转发到目标 data shard；所以 ingest 角色不需要“贴近 data”，反而更像是写入入口层职责的延伸。

默认不显式配置 `node.roles` 时，节点会拥有包括 data、ingest 在内的多种角色；如果手动配置了角色，就需要显式包含 `ingest`。需不需要部署单独的 ingest 节点，取决于 pipeline 的复杂度和写入吞吐。

需要单独部署专用 ingest 节点的典型场景：

- **重预处理**：例如对原始日志跑复杂 grok、大字典 enrich、geoip 查询，pipeline 单文档耗时显著（毫秒级以上）。预处理占满 CPU 时，会让 data 节点的索引和查询一起受拖累。
- **高吞吐日志接入**：海量 Beats / Agent 数据接入，解析成 ECS 结构后再落盘。
- **数据清洗在写入侧集中做**：避免每个上游应用各自处理，由集群统一规范。

#### Data Tiers 与 ILM

Elasticsearch 的典型场景——日志、指标、审计、行为追踪——几乎都有一个共同特征：**数据有明显的冷热规律**。最近几天的数据被频繁查询和聚合，几周前的数据偶尔翻一翻，几个月前的数据基本只为了合规留存。如果所有数据都堆在同一组节点上，就等于让最贵的硬件去存最冷的数据，既浪费磁盘又拖慢热查询。

data tiers 解决的就是这个问题：给集群分层级，让数据随“温度”下降从高性能硬件一路迁移到廉价存储。

data tiers 把数据分为四个层级：

- **hot**：承接实时写入和高频查询。CPU 强、内存大、本地 NVMe SSD，每 GB 存储最贵。通常只保留最近 1~7 天的数据。
- **warm**：查询频率明显下降，但仍有访问。可以用普通 SSD，CPU/内存可降配。常见范围是几周到几个月。
- **cold**：很少被查询，但需要保留以备查阅。可以用 SATA SSD 甚至 HDD，节点数少。数据仍然可搜索，但访问频率和性能预期都低于 hot/warm。
- **frozen**：长期归档，成本优先。frozen 节点不常驻完整 shard 在内存里，而是按需从快照存储（searchable snapshots）拉取；数据仍然可搜索，**但查询明显更慢，换来更低的本地磁盘和内存占用**。

层级是逻辑概念，不一定每个集群都配齐：小集群可以只有 hot+warm，甚至只有 hot。层级用 `node.roles` 标记，例如 `data_hot`、`data_warm`、`data_cold`、`data_frozen`。

光分层不够，还得让数据**自动**地从 hot 一路沉降到 frozen，最后被删除。这就是 `ILM（Index Lifecycle Management）` 的职责。

ILM 可以管理普通 index、index alias 和 data stream。对于日志、指标这类时间序列且以追加写入为主的数据，官方更推荐结合 `data stream` 使用：

1. **data stream** 替代固定 index 承接时间序列写入。它内部是一串按时间 rollover 出来的 backing indices，写入只走最新的那个；老 backing index 通常不再接收写入，适合进入后续生命周期阶段。
2. **rollover** 触发新 backing index 的创建。触发条件不是死板的“每天一个”，而是按 `max_primary_shard_size`（如 50GB）、`max_age`（如 1d）、`max_docs` 中任意一个达到即滚——shard 大小更稳定，避免了“某天特别大、某天特别小”。
3. **ILM policy** 把这些动作串成一条流水线，按年龄或条件依次执行：
   - rollover：达到大小/年龄就开新索引
   - force-merge：迁到 warm 之前压成 1 个 segment，省空间、加速查询
   - migrate/shrink：索引从 hot 节点搬到 warm/cold/frozen 节点，shrink 还能减少 primary 数
   - searchable snapshot：进 cold/frozen 时，把数据搬到对象存储 + 本地缓存
   - delete：到保留期（如 90d / 365d）直接删掉

举个典型的日志 ILM 规则：写入进 hot（SSD）→ 1 天或 50GB rollover → 7 天后 force-merge 并搬到 warm → 30 天后搬到 cold → 90 天删除。这条流水线一旦配好，运维无需手动介入，热数据始终在高性能节点、冷数据始终在廉价层。

#### Shard 规划：数量与容量

shard 不是越多越好。

过少的 shard 会限制并行度，也会让单个 shard 太大，影响查询和故障恢复。过多的 shard 会增加 heap、cluster state、文件句柄、搜索线程和协调开销。

官方当前给出的通用建议是：单个 shard 通常控制在 10GB 到 50GB，并且每个 shard 的 document 数量低于 2 亿。这个数字不是硬规则，但可以作为初始设计的经验范围。

时间序列数据应优先使用 data stream 和 ILM，通过 rollover 控制 shard 大小。比如日志索引可以按 `max_primary_shard_size`、`max_age`、`max_docs` 自动滚动，而不是固定每天一个索引。如果数据量变化很大，固定按天建索引很容易出现：某些天 shard 太小，某些天 shard 太大。

#### 内存分配：Heap 与 Page Cache

Elasticsearch 很依赖文件系统缓存。Lucene 的 segment 文件在磁盘上，但热数据会被 OS page cache 缓存。如果把大部分内存都给了 JVM heap，反而会让搜索变慢。

Elasticsearch 官方对 JVM heap 的配置给了几条硬规则，核心是**让 heap “够用就好”，把物理内存的一半留给文件系统缓存**：

- **heap 不超过机器物理内存的 50%**。剩余内存留给 OS page cache——Lucene 依赖它缓存 segment，搜索热数据基本都从此处命中。把内存都给 heap 反而会让 search 变慢。
- **heap 不是越大越好**：官方的说法是“**多数系统 26 GB 安全，部分系统可到 30 GB**”，所以大内存机器（64GB / 128GB RAM）的 heap 不是按比例放大，而是卡在 26~30 GB，剩下的全给 page cache。
- **`-Xms` 与 `-Xmx` 必须相等**，避免 JVM 运行时动态伸缩 heap 引发的停顿与 GC 抖动。

### 性能优化

性能优化的核心思想是两句话：写入时减少 refresh 与复制负担，查询时让 search-time 做更少的事。

#### 设计 Mapping，而不是依赖 Dynamic Mapping

生产环境中，mapping 应该像数据库 schema 一样被设计和版本管理。

常见建议：

- 字符串字段明确选择 `text`、`keyword` 或 multi-field。
- ID、状态、枚举、标签使用 `keyword`，不要因为它们看起来是数字就一定用 `long`。
- 只需要聚合不需要搜索的字段，可以考虑 `index: false`。
- 不需要排序和聚合的字段，可以考虑关闭 `doc_values`。
- 对不可控 JSON，限制 dynamic mapping，避免字段爆炸。
- 日期格式显式定义，避免自动推断错误。
- 大文本如果只需要简单匹配、不需要评分，可以评估 `match_only_text`。

字段越多，mapping 越复杂，segment 需要维护的元数据也越多。日志场景中最常见的问题之一，就是把任意 JSON 全量展开成字段，最终导致 mapping explosion。

#### 写入优化

高吞吐写入场景中，优先考虑以下方式：

- 使用 bulk API，不要单条写入。
- 根据压测结果选择 bulk 大小，通常避免单个 bulk 请求过大。
- 使用多个 worker 并发写入，但监控 429 拒绝响应。
- 大批量初始化导入时，可以临时增大 `refresh_interval`，甚至设置为 `-1`。
- 初始化导入且源数据可重放时，可以临时把 replica 设置为 0，导入后再恢复。
- 如果不需要业务自定义 `_id`，使用自动生成 ID，避免写入前检查同 ID 是否已存在。
- 给文件系统缓存留下足够内存，不要把机器内存都分给 JVM heap。
- 使用 SSD 和本地盘，避免高延迟远程存储。

一个典型的大批量导入流程：

```json
PUT /orders/_settings
{
  "index": {
    "refresh_interval": "-1",
    "number_of_replicas": 0
  }
}
```

导入完成后恢复：

```json
PUT /orders/_settings
{
  "index": {
    "refresh_interval": "1s",
    "number_of_replicas": 1
  }
}
```

然后视情况手动 refresh。对于已经变成只读的历史索引，可以在低峰期 force merge，但不要对仍在写入的热索引频繁 force merge。

#### 查询优化

查询优化的核心思想是：让 search-time 做更少的事。

常见手段包括：

- 能用 filter 的条件不要放在 must 中评分。
- 避免深分页，使用 `search_after`。
- 避免在太多字段上做 `query_string` 或 `multi_match`。
- 对固定查询模式，在写入时预处理字段，例如 `copy_to`。
- 避免脚本排序、脚本聚合和复杂 `script_score`。
- 避免在高基数字段上做大规模 terms aggregation。
- 对时间查询使用更容易缓存的范围，例如 `now-1h/h` 这类取整时间。
- 对 ID 类字段使用 `keyword`，而不是盲目使用数值类型。
- 尽量只取需要的字段，减少 fetch phase 的 `_source` 解析和网络传输。

如果一个查询必须扫很多 shard、读很多字段、执行脚本、做高基数聚合，那么它慢是正常的。优化不是调一个参数，而是改变数据模型和查询模型。

### 常见的坑

#### 坑一：把 Elasticsearch 当主数据库

Elasticsearch 可以保存数据，但它不是通用事务数据库。它更适合作为搜索视图和分析视图。

如果业务强依赖事务、一致性约束、复杂更新、跨记录关系，主存储应该放在关系型数据库、KV、文档数据库或事件日志中。Elasticsearch 从这些系统同步数据，用于检索和分析。

#### 坑二：以为写入成功就一定马上能搜到

写入成功只表示 primary 和相关 replica 已经接受写入，不表示 refresh 已经发生。默认情况下，搜索是近实时的，不是严格实时的。

如果测试中需要搜索请求等待刚写入的数据变得可见，可以使用：

```text
?refresh=wait_for
```

`refresh=wait_for` 会等待下一次 refresh，而不是立刻强制 refresh；如果使用 `refresh=true`，Elasticsearch 会立即 refresh，频繁使用会制造大量小 segment，显著降低写入性能。高吞吐生产写入中不应把 refresh 参数当作默认选项。

#### 坑三：`text` 和 `keyword` 混用

这是最常见的问题。

- 全文搜索用 `text` + `match`。
- 精确匹配用 `keyword` + `term`。
- 排序和聚合通常用 `keyword`、数值、日期等带 doc values 的字段。

如果一个字符串字段既要全文搜，又要精确匹配，就使用 multi-field。

#### 坑四：字段爆炸

日志系统里经常有这种数据：

```json
{
  "labels": {
    "pod_abc_123": "1",
    "pod_def_456": "1"
  }
}
```

如果 dynamic mapping 开着，每个动态 key 都可能变成一个新字段。字段数量暴涨后，cluster state、mapping 元数据、segment 元数据、heap 都会受影响。

解决方式包括：

- 禁用或限制 dynamic mapping。
- 使用 `flattened` 类型承接未知 key-value。
- 在写入前清洗字段名。
- 对标签类数据建立明确规范。

#### 坑五：Shard 太多

很多人会为了“并行”给每个小索引建很多 shard，结果集群里出现成千上万个小 shard。

每个 shard 都有管理成本。搜索时，每个 shard 都要参与调度和合并。大量小 shard 往往比少量适中 shard 更慢。

时间序列数据要用 rollover 控制 shard 大小，而不是机械地每天固定建多个 shard。

#### 坑六：深分页

`from + size` 越大，每个 shard 要维护的候选队列越大，coordinating node 合并的结果也越多。

用户前台翻页通常不应该允许翻到几千页。需要连续翻页时优先使用 `search_after` + PIT；全量扫描或重建索引类批处理任务再考虑 scroll。

#### 坑七：对热索引 force merge

force merge 可以减少 segment 数量，但它是重操作。对仍在写入的索引 force merge，可能制造巨大 segment，影响后续 merge 和快照增量，还会和正常写入抢 I/O。

force merge 更适合在索引变成只读以后，在低峰期执行。

#### 坑八：Nested 和 Parent-Child 滥用

Elasticsearch 支持 `nested` 和 join-like 的 parent-child，但它们都有成本。搜索引擎天然更喜欢扁平、冗余、面向查询的文档模型。

如果可以通过反范式化解决，就不要优先建复杂关系。Elasticsearch 中的冗余不是坏味道，很多时候是性能设计的一部分。

#### 坑九：忽视 429

写入时出现 `429 TOO_MANY_REQUESTS`，说明集群已经跟不上当前写入压力。客户端应该退避重试，最好使用带随机抖动的指数退避。

继续无脑重试只会让队列更满，导致延迟扩大，甚至影响整个集群。

#### 坑十：只看 JVM Heap，不看 Page Cache 和 I/O

Elasticsearch 慢不一定是 heap 不够。很多查询问题来自 page cache 不足、磁盘随机读、segment 太多、shard 太多、查询太重。

排查性能时至少要同时看：

- search/indexing latency
- thread pool queue 和 rejection
- JVM heap 与 GC
- segment 数量
- shard 分布和热点
- page cache 命中情况
- 磁盘 I/O 延迟
- refresh、merge、flush 指标

### 全流程速览

最后用一个简化流程把前面的内容串起来。

写入时：

```text
JSON document
  -> mapping 决定字段类型
  -> text 字段经过 analyzer
  -> 生成倒排索引、doc values、stored fields
  -> 写入 indexing buffer 和 translog
  -> primary shard 复制到 replica
  -> refresh 后生成可搜索 segment
  -> 后台 merge 合并 segment
```

查询时：

```text
search request
  -> coordinating node
  -> 找到相关 shard
  -> query phase: 每个 shard 本地查询、评分、排序
  -> coordinating node 合并 shard top results
  -> fetch phase: 取回 _source 和 fields
  -> 返回客户端
```

从这个流程看，Elasticsearch 的性能很大程度上取决于四个设计：

1. 数据如何建模：字段类型、分词、冗余、嵌套结构。
2. 索引如何拆分：shard 数量、shard 大小、routing、生命周期。
3. 写入如何组织：bulk、refresh、replica、ID、并发。
4. 查询如何表达：filter、分页、聚合、排序、脚本、字段选择。

Elasticsearch 最擅长的不是“像数据库一样保存一切”，而是“为查询而组织数据”。当我们按这个思路建模时，它可以非常快；当我们把它当成一个支持模糊查询的通用数据库时，很多坑都会变成必然。

### 参考资料

- [Elasticsearch Docs: Clusters, nodes, and shards](https://www.elastic.co/docs/deploy-manage/distributed-architecture/clusters-nodes-shards)
- [Elasticsearch Docs: Node roles](https://www.elastic.co/docs/deploy-manage/distributed-architecture/clusters-nodes-shards/node-roles)
- [Elasticsearch Docs: Reading and writing documents](https://www.elastic.co/docs/deploy-manage/distributed-architecture/reading-and-writing-documents)
- [Elasticsearch Docs: Near real-time search](https://www.elastic.co/docs/manage-data/data-store/near-real-time-search)
- [Elasticsearch Docs: Refresh parameter](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/refresh-parameter)
- [Elasticsearch Docs: Mapping](https://www.elastic.co/docs/manage-data/data-store/mapping)
- [Elasticsearch Docs: Doc values](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/doc-values)
- [Elasticsearch Docs: Text analysis](https://www.elastic.co/docs/manage-data/data-store/text-analysis)
- [Elasticsearch Docs: Paginate search results](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results)
- [Elasticsearch Docs: Data tiers](https://www.elastic.co/docs/manage-data/lifecycle/data-tiers/)
- [Elasticsearch Docs: Index lifecycle management](https://www.elastic.co/docs/manage-data/lifecycle/index-lifecycle-management/)
- [Elasticsearch Docs: Tune for indexing speed](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/indexing-speed)
- [Elasticsearch Docs: Tune for search speed](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/search-speed)
- [Elasticsearch Docs: Size your shards](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/size-shards)
- [Elasticsearch Docs: Tune for disk usage](https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/disk-usage)
- [Apache Lucene: Lucene 9.x file format](https://lucene.apache.org/core/9_11_1/core/org/apache/lucene/codecs/lucene99/package-summary.html)
- [Apache Lucene: DocValues format](https://lucene.apache.org/core/9_11_1/core/org/apache/lucene/codecs/lucene90/Lucene90DocValuesFormat.html)
