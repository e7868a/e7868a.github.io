---
title: How it works - Kafka
category: 系统运维
---

Kafka 经常被放在“消息中间件”这个大类里，但它和 RabbitMQ、ActiveMQ 这类传统消息中间件的出发点并不一样。Kafka 的核心抽象不是“队列中有一批待处理消息，消费者处理完就删除”，而是“一个可持久化、可分区、可复制、可按 offset 反复读取的追加日志”。生产者把事件追加到日志末尾，消费者自己记录读到了哪里；事件是否被某个消费者读过，并不决定它是否从 Kafka 删除。删除由保留策略决定。

这个差异不只是实现细节，而是一套完全不同的哲学：传统队列更像任务分发系统，Kafka 更像事件事实的分布式日志。

### Kafka 是什么

Kafka 最早要解决的问题，是如何把公司内部不断产生的日志、埋点、指标、数据库变更、业务事件，可靠地汇聚起来，再让多个下游系统按自己的节奏消费。一个在线系统会产生很多事实：

- 用户点击了一次按钮。
- 订单创建成功。
- 数据库某一行发生变更。
- 某个服务产生一条指标或审计日志。

这些事实不只对一个消费者有价值。风控、推荐、搜索、数仓、实时计算、审计、监控都可能需要同一批事件，而且它们读取的速度、上线时间、修复 bug 后的重放需求都不同。

如果用传统队列模型来解决，直觉上通常是：

1. Producer 把消息投递到 queue。
2. Broker 把消息分发给 consumer。
3. Consumer 处理完成后 ack。
4. Broker 删除已确认消息。

这个模型很适合任务队列：一个任务被某个 worker 处理成功，就可以从队列里消失。RabbitMQ 的 exchange、binding、queue 也非常适合复杂路由、按队列隔离任务、失败后重投或进入死信队列。

Kafka 的问题意识不同。它关心的是：

- 同一批事件能不能被多个系统独立读取？
- 下游挂了几个小时，恢复后能不能从断点继续？
- 修复下游 bug 后，能不能从昨天的 offset 重新跑一遍？
- 写入吞吐能不能靠顺序追加、批处理和分区横向扩展？
- 消费者速度不一样时，能不能互不影响？

所以 Kafka 没有把“消费完成后删除消息”当成核心路径。它把事件写进 topic 的 partition log，消费者只维护自己的 offset。一个 consumer group 读完了，不影响另一个 consumer group 明天再读；消费者出错，也可以回到旧 offset 重新处理。
这里藏着一个更深的取舍：Kafka 不是不保存状态，而是不在 broker 上为每个消费者维护每条消息的投递和 ack 状态。传统消息中间件的 broker 需要关心消息有没有确认、是否要重新投递、什么时候可以删除；Kafka 则把消息保存成 partition log，并让 consumer group 用 committed offset 表示自己的消费位置。

这种把消息级投递状态压缩成 per-partition offset 的思路，是一种新的设计哲学。它带来的结果是双面的：broker 的职责更适合顺序追加、批量复制和长期保留；但消费语义的可靠性也转移到了消费者一侧——offset 在什么时候提交、业务处理失败要不要回退、重复消息如何幂等，都成了写消费者的人必须想清楚的事。

#### Kafka 和传统消息中间件的不同

可以用一张表先建立直觉：

| 维度 | Kafka | RabbitMQ 经典队列模型 |
| --- | --- | --- |
| 核心抽象 | 分区追加日志 | exchange、binding、queue |
| 数据生命周期 | 按 retention 或 compaction 策略保留 | 消费者 ack 后通常可删除 |
| 消费位置 | consumer group 自己维护 offset | broker 跟踪未确认投递 |
| 重放能力 | 天然支持从旧 offset 重新读取 | 经典队列不以历史重放为核心 |
| 顺序性 | 单个 partition 内有序 | 单队列可保持基本顺序，重投、并发、优先级会影响 |
| 扩展方式 | 增加 partition、broker 和 consumer | 增加 queue、consumer、节点，受队列模型影响 |
| 路由能力 | topic + key/partitioner，路由相对简单 | exchange 类型和 binding 提供丰富路由 |
| 常见强项 | 事件流、高吞吐、多订阅者、回放、数据管道 | 任务队列、复杂路由、按消息确认、低延迟投递 |

RabbitMQ 更像“把任务可靠地交给某个消费者处理”。Kafka 更像“把发生过的事实写进一条可复制的日志，让不同系统都可以从这条日志中构建自己的状态”。前者强调投递、路由、ack、重投；后者强调追加、保留、offset、重放、分区并行。

#### Kafka 的哲学：日志是事实来源

Kafka 里的 message 更准确地说是 event。Event 表示已经发生的事实，而不是“请某个消费者执行的命令”。例如：

```text
OrderCreated(orderId=10001, userId=42, amount=199.00)
PaymentSucceeded(orderId=10001, paymentId=90001)
InventoryReserved(orderId=10001, skuId=ABC, quantity=1)
```

这些事件一旦发生，就有长期价值。搜索系统可以用它更新索引，风控系统可以用它做实时判断，数仓可以用它做分析，审计系统可以用它保留证据。如果某个下游处理错了，可以从历史事件重新构建自己的状态。

这就是 Kafka 和普通队列最关键的差异：Kafka 不只是在“传消息”，它是在保存一条可回放的事实流。

当然，这种哲学也带来成本。Kafka 不适合所有场景：

- 如果你需要复杂的按 header、routing key、binding 规则投递，RabbitMQ 往往更直接。
- 如果你需要任务失败后按配置进入死信队列，再由运维手工补偿，传统队列模型更贴近。
- 如果每条消息都像同步 RPC 请求，需要立即返回业务结果，Kafka 会让调用链变复杂。
- 如果消息巨大，单条几十 MB，Kafka 的 batch、复制、缓存和消费都会被拖累。
- 如果只想让多个 worker 抢一个严格有序队列里的任务，Kafka 的 partition 模型并不天然合适。

Kafka 最适合的场景，是事件本身有长期价值，并且需要被多个系统独立、可回放、高吞吐地消费。

### Kafka 的基本概念和架构

Kafka 集群由多个 broker 组成。业务数据按 topic 组织，topic 再拆成多个 partition。每个 partition 是一个有序的追加日志，并可以复制出多个 replica 分布在不同 broker 上。

![Kafka cluster topic partition architecture](img/posts/kafka-cluster-topic-partition-architecture.svg)

这张图里有几个关键对象。

#### Record、Topic 与 Partition

Record 是 Kafka 中写入的单条事件，通常包含 key、value、timestamp 和 headers。业务上常说 message，Kafka 文档里也会看到 record、event、message 混用。

Topic 是事件的逻辑分类，例如：

```text
order-events
payment-events
user-clicks
inventory-changes
```

Partition 是 topic 的物理分片，也是 Kafka 的顺序边界和并行边界。一个 topic 可以有多个 partition，每个 partition 内的 record 按 offset 递增排列。

Kafka 只保证单个 partition 内有序，不保证整个 topic 全局有序。这个限制非常重要。

如果订单 `10001` 的 `created`、`paid`、`shipped` 必须按顺序处理，就应该用 `orderId` 作为 key，让同一个订单的事件进入同一个 partition。代价是这个订单的事件只能由同一个 consumer 实例按序处理，不能跨多个 partition 并行。

#### Offset

Offset 是某个 partition 内的位置。它不是全局消息 ID，也不跨 partition 比较大小。

例如：

```text
topic: order-events

partition 0: offset 0, 1, 2, 3, ...
partition 1: offset 0, 1, 2, 3, ...
partition 2: offset 0, 1, 2, 3, ...
```

`order-events-0` 的 offset 100 和 `order-events-1` 的 offset 100 没有全局先后关系。消费者提交 offset 时，提交的是某个 consumer group 在某个 topic partition 上的进度。

可以把 consumer group 的进度理解成一张表：

```text
group: billing-service

topic          partition   committed offset
order-events   0           15342
order-events   1           18201
order-events   2           14987
```

这张表的含义是：`billing-service` 这个消费组下次从这些 committed offset 开始读取。其它消费组不受影响，可以有完全不同的位置。

#### Producer 与 Partitioner

Producer 负责把 record 写入 topic。写入前，它要决定目标 partition。

常见策略有三种：

- 显式指定 partition。
- 根据 key 做 hash，让同一个 key 落到同一个 partition。
- 没有 key 时，由 producer 的分区策略把流量分散到多个 partition。

实际业务中，key 设计比很多人想象得更重要。它决定了顺序性、并行度和热点风险。

例如订单事件用 `orderId` 做 key，可以保证同一个订单内有序；但如果某个大客户的订单量远高于其它客户，而你用 `customerId` 做 key，就可能把大量流量打到同一个 partition，形成 hot partition。

#### Consumer Group

Consumer 以 consumer group 的形式工作。同一个 group 内，Kafka 会把 topic partition 分配给 group 中的 consumer。一个 partition 在同一时刻只会分配给同一个 group 里的一个 consumer。

这个规则有两个结果：

第一，同一个 group 内可以横向扩容。假设一个 topic 有 12 个 partition，一个 consumer group 最多可以让 12 个 consumer 并行消费这些 partition。再多的 consumer 会空闲，因为没有更多 partition 可分配。

第二，不同 group 之间互不影响。搜索系统、风控系统、数仓同步系统可以分别使用不同的 group，独立消费同一个 topic。搜索系统慢了，不会改变风控系统的 offset。

#### Replica、Leader 与 ISR

为了高可用，每个 partition 可以有多个 replica。某一时刻只有一个 replica 是 leader，producer 写入 leader，consumer 通常也从 leader 读取。Follower 从 leader 拉取数据，持续复制。

ISR 是 in-sync replicas，也就是被认为和 leader 同步进度足够接近的副本集合。Kafka 的写入可靠性和 leader 故障恢复都和 ISR 有关。

生产环境中经常看到这样的配置组合：

```text
replication.factor=3
min.insync.replicas=2
producer acks=all
```

这表示每个 partition 有 3 个副本；当 producer 使用 `acks=all` 时，leader 会等待当前 ISR 中的所有副本确认后才返回成功，而 `min.insync.replicas=2` 会在 ISR 少于 2 个副本时让写入失败。注意，`replication.factor=3` 本身不等于每次写入都已经安全复制到 3 份。如果 producer 使用 `acks=1`，leader 本地写入成功就可以返回，leader 宕机时仍可能丢失尚未复制的数据。

#### Controller、KRaft 与元数据

Kafka 还需要管理元数据：有哪些 broker、topic 有哪些 partition、leader 在哪个 broker、ISR 是哪些副本、consumer group 状态如何变化。负责协调这些元数据变化的角色叫 controller。

在 ZooKeeper 模式下，Kafka 把集群元数据存在 ZooKeeper 里，controller 选举也依赖 ZooKeeper 的临时节点 `/controller`。此时 controller 由某个 broker **兼任**，整个集群同一时刻只有一个 active controller。

Kafka 从 2.8 开始引入 KRaft 模式，之后逐步把元数据管理迁移到 Kafka 自己的 controller quorum。KRaft 模式下，Kafka **自己管理元数据**，不再需要 ZooKeeper。

按本文时间点看，Kafka 4.0 已经移除 ZooKeeper 支持，进入 KRaft-only 阶段。如果维护的是 3.x 或更早集群，仍然可能遇到 ZooKeeper 模式和 ZK 到 KRaft 的迁移问题；新建集群则应该按 KRaft 来理解 controller quorum。

### Kafka 的工作原理

#### 写入流程：一条消息如何进入 Kafka

Producer 写入 Kafka 大致经历这些步骤：

1. Producer 获取 topic 元数据，知道每个 partition 的 leader broker。
2. Producer 根据 key、partitioner 或显式 partition 选择目标 partition。
3. Producer 在本地把多条 record 攒成 batch，并按配置压缩。
4. Producer 把 batch 发送给目标 partition 的 leader broker。
5. Leader 把 batch 追加到 partition log 末尾。
6. Follower 从 leader 拉取新数据并复制。
7. Leader 根据 `acks` 配置决定何时向 producer 返回成功或失败。

![Kafka produce replication flow](img/posts/kafka-produce-replication-flow.svg)

Kafka 写入吞吐高，不是因为某个神奇参数，而是多个设计叠加：

- Producer 批量发送，减少请求次数。
- Record batch 可以压缩，降低网络和磁盘成本。
- Broker 顺序追加到 log，避免频繁随机写。
- 操作系统 page cache 承担大量缓存工作。
- Consumer 读取最近写入的数据时，经常能命中 page cache。
- Kafka 尽量减少不必要的数据复制，利用顺序读写和批处理提升效率。

这些设计决定了 Kafka 的调优常常是吞吐、延迟、CPU、内存、可靠性之间的平衡。比如 `linger.ms` 增大后，producer 会多等一小段时间攒 batch，吞吐和压缩率可能上升，但单条消息延迟也会上升。

#### `acks`、幂等生产者与写入可靠性

Producer 的 `acks` 决定写入确认语义：

- `acks=0`：producer 不等待 broker 确认，吞吐高，但可靠性最弱。
- `acks=1`：leader 写入本地后返回成功，follower 是否已复制不保证。
- `acks=all`：leader 等待当前 ISR 中所有副本确认后返回，是最强的 producer ack 语义。

`acks=all` 通常要和 topic 级别的 `min.insync.replicas` 配合。如果 `min.insync.replicas=2`，ISR 只剩 1 个副本时，写入应该失败，而不是继续在副本不足时假装可靠。

Kafka 的幂等 producer 通过 producer id 和序列号减少重试导致的重复写入。它能解决的是生产端“同一批写入因为网络超时而重试”的一类问题，不等于业务端永远不会重复消费，也不等于所有外部副作用都 exactly once。

如果消费者读 Kafka、处理后再写回 Kafka，Kafka 事务可以把写出记录和 offset 提交放进同一个事务边界，提供更强的 Kafka 内部处理语义。但只要你的业务还会写数据库、发 HTTP 请求、调用第三方系统，就仍然需要业务幂等。

#### 消费流程：Consumer 如何读取数据

Consumer 不是从 broker 那里“领取消息后删除”。它会不断 poll 自己被分配的 partition，从某个 offset 开始顺序读取。

消费流程大致是：

1. Consumer 加入 consumer group。
2. Group coordinator 为 group 内的 consumer 分配 partition。
3. Consumer 向对应 partition 的 leader broker 发起 fetch 请求。
4. Broker 从指定 offset 开始返回一批 record。
5. Consumer 处理 record。
6. Consumer 提交 offset，表示这个 group 的进度。

![Kafka consume offset storage flow](img/posts/kafka-consume-offset-storage-flow.svg)

默认情况下，consumer group 的 offset 会提交到 Kafka 内部 topic `__consumer_offsets`。这个 topic 使用 log compaction 保留每个 group、topic、partition 组合较新的进度。

Offset 提交时机决定了失败后的语义：

- 先处理业务，再提交 offset：处理成功但提交失败时，重启后可能重复处理，通常是 at-least-once。
- 先提交 offset，再处理业务：提交成功但业务失败时，消息可能被跳过，通常不推荐。
- 业务处理和 offset 提交在同一事务边界内：只在特定场景能成立，尤其是 Kafka 到 Kafka 的事务流处理。

所以，业务消费者应该默认“消息可能重复”。常见做法是：

- 事件带稳定的 event id。
- 数据库写入使用唯一键或幂等 upsert。
- 状态机只允许合法状态转换。
- 对外部请求带幂等键。
- offset 提交由业务处理完成后显式控制。

#### Rebalance：为什么消费者会抖动

同一个 consumer group 内，consumer 数量变化、订阅 topic 变化、consumer 太久没有 poll、broker 认为 consumer session 超时，都可能触发 rebalance。Rebalance 会重新分配 partition。

Rebalance 本身不是错误，但频繁 rebalance 会导致：

- 一段时间内消费暂停。
- partition ownership 频繁迁移。
- 处理中的消息可能重复。
- consumer lag 抖动。
- 下游处理延迟上升。

常见优化包括：

- 控制单次 poll 后的处理时间，避免超过 `max.poll.interval.ms`。
- 合理设置 `max.poll.records`，不要一次拉取远超处理能力的数据。
- 使用 static membership 减少短暂重启带来的 group 抖动。
- 对支持的客户端启用 cooperative rebalance，减少全量撤销分区的影响。
- 把 poll 和业务处理解耦时，要明确背压和 offset 提交边界，避免拉太多处理不了。

#### 存储流程：Partition Log 如何落盘

Kafka 的存储单元是 partition log。每个 partition 在 broker 磁盘上对应一个目录，目录中包含多个 segment。Segment 通常包括数据文件和索引文件，例如 `.log`、`.index`、`.timeindex`。

可以把一个 partition 想象成下面这样：

```text
order-events-0/
  00000000000000000000.log
  00000000000000000000.index
  00000000000000000000.timeindex
  00000000000001000000.log
  00000000000001000000.index
  00000000000001000000.timeindex
```

`.log` 保存 record batch。`.index` 通过 offset 找到大致文件位置，`.timeindex` 通过时间戳辅助按时间查找。索引通常是稀疏索引，不需要每条消息都有一条索引记录。

Kafka 选择追加写，而不是消费后立刻随机删除消息。这样做有几个好处：

- 写入路径简单，磁盘顺序写性能高。
- 删除可以按 segment 批量进行，而不是逐条消息删除。
- 慢 consumer 不会影响其它 consumer group 读取同一批历史数据。
- 最近写入的数据常驻 page cache，写入后很快被消费时成本很低。

#### Retention 与 Log Compaction

Kafka 的数据清理主要有两类。

第一类是 delete retention。Topic 可以按时间或大小保留数据，例如保留 7 天，或者每个 partition 最多保留一定大小。超过阈值后，Kafka 按 segment 删除旧数据。

第二类是 log compaction。Compact topic 不要求保留每一条历史事件，而是尽量保留每个 key 的最新值。它适合配置、用户画像、订单当前状态这类“我关心某个 key 最新状态”的场景。

例如：

```text
key=user-1 value={"level":"silver"}
key=user-2 value={"level":"gold"}
key=user-1 value={"level":"platinum"}
```

经过 compaction 后，`user-1` 的旧版本可能被清理，只保留较新的值。

Compact 不是数据库更新。它是后台清理过程，不保证旧值立刻消失，也不适合保存必须完整追溯的审计流水。如果业务要求每一次状态变化都不能丢，就不要只依赖 compact topic。

### Kafka 逻辑部署

#### Controller Quorum

这一小节针对的是 **KRaft 模式**。如果你的集群还在用 ZK 模式，没有独立 controller quorum 这回事——此时 controller 由某个 broker 兼任，元数据存在 ZooKeeper，奇数节点和多数派容错的要求落在 **ZooKeeper 集群**上。

在 KRaft 模式下，controller 负责元数据 quorum。它管理 broker 注册、topic 元数据、partition leader、ISR 变化等信息。

生产环境通常会把 controller 节点和 broker 节点拆开。原因很简单：broker 承担数据读写、复制、网络和磁盘 I/O，负载波动大；controller 承担元数据一致性，应该尽量稳定。

Controller 数量通常选择奇数，例如 3 或 5：

```text
3 controllers: 可容忍 1 个 controller 故障
5 controllers: 可容忍 2 个 controller 故障
```

这不是为了提高写入吞吐，而是为了让元数据 quorum 在故障时还能形成多数派。

#### Broker 层

Broker 是数据面，真正保存 partition 数据。Broker 规划要看几个维度：

- 每秒写入吞吐和读取吞吐。
- 单条消息大小和压缩率。
- Topic 数量与 partition 数量。
- 每个 partition 的 replication factor。
- Retention 时间和磁盘容量。
- 跨机架或跨可用区放置策略。
- 故障恢复时允许多久追平副本。

假设一个 topic 有 12 个 partition，`replication.factor=3`，那么集群中会有 36 个 replica。Kafka 要把这些 replica 尽量均匀分散到 broker 上，并让 leader 也尽量均衡。否则可能出现某些 broker leader 过多、网络和磁盘压力过高，而其它 broker 相对空闲。

#### Topic 与 Partition 规划

Partition 数量决定了并行上限，但不是越多越好。

Partition 太少：

- Producer 写入并行度不够。
- Consumer group 横向扩容受限。
- 单个 partition 太大，恢复和迁移成本高。

Partition 太多：

- Broker 文件句柄和内存占用增加。
- Controller 元数据压力增加。
- Leader 选举和副本恢复成本增加。
- Consumer rebalance 时间变长。
- 小 partition 太多，运维和监控复杂度上升。

规划 partition 时，至少要同时看：

- 峰值写入吞吐。
- 单个 consumer 实例能处理多少吞吐。
- 需要多少消费并行度。
- key 分布是否均匀。
- 未来是否需要扩容。
- 单 partition 保留数据量是否可接受。

还要注意，增加 partition 会改变 key 到 partition 的映射。对于依赖 key 顺序的业务，扩 partition 之后，新数据的 key 分布可能和历史数据不同，顺序假设要重新评估。

#### 副本与跨机房

生产环境常见副本数是 3，再配合 `min.insync.replicas=2` 和 producer `acks=all`。如果部署在多个机架或可用区，应该让副本分散到不同故障域。

但跨可用区复制不是免费的。它会增加：

- 写入确认延迟。
- 副本复制网络成本。
- 故障切换后的跨区流量。
- ISR shrink 的概率。

所以副本策略要和业务 RPO、延迟预算、网络成本一起设计。不要只为了“看起来高可用”把所有 topic 都用最高规格，也不要为了省成本让关键 topic 只有一个副本。

#### 客户端与下游部署

Kafka 的容量不只在 broker 侧。Producer 和 consumer 的部署位置也很关键。

Producer 侧要关注：

- 是否和 broker 网络距离过远。
- 是否使用合适的 batch、压缩和重试配置。
- 是否有稳定 key，是否导致热点。
- 是否能处理 broker 返回的 retriable error 和不可重试错误。

Consumer 侧要关注：

- 每个 group 的 consumer 数量是否超过 partition 数量。
- 单个 consumer 的处理能力是否匹配 `max.poll.records`。
- 业务处理慢时是否有背压。
- offset 提交是否和业务处理结果一致。
- 下游数据库、搜索、对象存储是否成为真正瓶颈。

很多 Kafka “性能问题”最后不是 broker 问题，而是某个 consumer 写数据库太慢，或者某个 key 把全部流量压到单个 partition。

#### 监控与容量水位

Kafka 监控不能只看集群整体吞吐。至少要按 broker、topic、partition、consumer group 观察：

- Under-replicated partitions。
- ISR shrink/expand。
- Offline partitions。
- Leader 分布是否均匀。
- Broker 磁盘水位和磁盘 I/O。
- 网络入口、出口、请求延迟。
- Producer error、retry、record send rate。
- Consumer lag，尤其是按 partition 拆开的 lag。
- Rebalance 次数和耗时。
- Page cache 命中情况、GC、文件句柄。

只看总 lag 很容易误判。总 lag 不高，但某个 partition lag 很高，往往说明有 hot key、单分区消费慢或分配不均。

### Kafka 性能优化与易踩的坑

#### Producer 优化

Producer 最重要的是让 Kafka 能批量、压缩、顺序写。

常见参数和思路：

- `batch.size`：单个 batch 的目标大小。太小会增加请求开销，太大可能增加内存压力和尾延迟。
- `linger.ms`：producer 等待更多记录进入 batch 的时间。增大它通常能提升吞吐和压缩率，但会增加等待延迟。
- `compression.type`：常见选择有 `lz4`、`snappy`、`zstd`。低延迟场景常用 `lz4` 或 `snappy`，追求更高压缩率时可以评估 `zstd`。
- `acks`：可靠性和延迟的核心权衡。关键业务不要只为了吞吐使用 `acks=1`。
- `enable.idempotence`：建议开启，以减少 producer 重试造成的重复写入。
- `delivery.timeout.ms`、`request.timeout.ms`、`retries`：要和业务超时预期一致，避免无限堆积或过早失败。

但参数只是结果。更重要的是建模：

- key 是否稳定？
- key 分布是否均匀？
- 是否存在热点实体？
- 事件是否足够小？
- Schema 是否可演进？
- 下游能否处理重复？

#### Consumer 优化

Consumer 的关键是稳定 poll、可控处理、明确提交。

常见参数和思路：

- `max.poll.records`：控制每次 poll 返回记录数，避免一次拉太多导致处理超时。
- `max.poll.interval.ms`：限制两次 poll 的最大间隔，业务处理超过这个时间会触发 rebalance。
- `fetch.min.bytes` 和 `fetch.max.wait.ms`：影响 broker 聚合返回数据的策略，可在吞吐和延迟之间取舍。
- `enable.auto.commit`：简单场景方便，但生产消费者通常更倾向显式提交。
- `group.instance.id`：启用 static membership，减少短暂重启造成的 rebalance。

业务处理慢时，不要简单增加 consumer 数量。先看：

- Topic partition 数是否足够。
- Lag 是否集中在少数 partition。
- 消费者是否被下游数据库或外部 API 卡住。
- 单条消息处理是否太重。
- 是否需要把大任务拆成更小的事件。

#### Topic 与存储优化

Topic 级别的优化主要围绕 partition、retention、compaction 和消息大小。

- Retention 不是越长越好。保留时间越长，磁盘成本、恢复成本、迁移成本越高。
- Retention 也不能太短。慢消费者、停机修复、历史补数都依赖数据还在。
- Compact topic 只适合按 key 保留最新状态，不适合完整审计流水。
- 单条消息不要过大。大消息会破坏 batch、压缩、page cache、replica fetch、consumer 内存和 GC。
- Schema 要管理。没有 schema 演进规则的事件流，迟早会让下游系统被兼容性问题拖垮。

#### 坑一：把 Kafka 当成更快的 RabbitMQ

Kafka 不是复杂路由和任务 ack 系统。它可以做异步解耦，也可以削峰，但它的优势来自 retained log、partition、consumer group 和 replay。

如果你的核心需求是：

- 一条任务只需要被一个 worker 处理；
- 失败后按配置进入死信队列；
- 根据 routing key/header 做复杂路由；
- 消费成功后立即删除；

那么 RabbitMQ 或任务队列可能更贴近模型。用 Kafka 也能做一部分，但你要自己补很多任务队列语义。

#### 坑二：误以为 topic 全局有序

Kafka 只保证 partition 内有序。一个 topic 有多个 partition 时，不同 partition 之间没有全局顺序。

如果业务需要某个实体内有序，把实体 id 作为 key。如果业务需要全局有序，就要接受单 partition 的并行度限制，或者重新审视“全局有序”是否真的是业务必需。

#### 坑三：Partition 数量随意

Partition 太少扩不动，太多也会带来成本。不要把 partition 当成可以无限增加的线程数。

规划时至少估算：

```text
目标写入吞吐 / 单 partition 可承载吞吐
目标消费吞吐 / 单 consumer 可处理吞吐
保留时间内单 partition 数据量
broker 数量与副本分布
未来扩容空间
```

这只是估算起点，最终还要压测验证。

#### 坑四：Hot Key

按 key 分区能保证同 key 顺序，但 key 分布不均会形成热点。一个 hot key 可以让某个 partition lag 暴涨，而其它 partition 很空。

解决方式可能是：

- 改 key 设计。
- 对热点实体拆分二级 key。
- 单独拆出热点 topic。
- 接受该实体不能完全按单 key 严格有序。
- 在下游做局部聚合和幂等合并。

不要指望只增加 partition 就能解决单 key 热点。同一个 key 仍然会进入同一个 partition。

#### 坑五：自动提交 offset 带来的错觉

`enable.auto.commit=true` 很方便，但它提交的是 consumer 的读取进度，不一定等于业务处理已经成功。

如果 consumer poll 到一批消息后自动提交了 offset，业务处理还没完成就崩溃，这批消息可能不会按你预期重新处理。生产消费者通常要显式控制提交时机，让 offset 进度和业务处理结果对齐。

#### 坑六：不做幂等，假设消息只处理一次

Kafka 使用中应默认会重复：

- Producer 可能重试。
- Consumer 可能处理成功但提交 offset 失败。
- Rebalance 可能让消息重新分配。
- 网络超时可能让客户端无法判断服务端是否已经处理。
- 下游写入成功但应用进程崩溃。

幂等 producer 不等于端到端 exactly-once。业务侧写数据库、扣库存、发通知、调用第三方系统，都要有自己的幂等设计。

#### 坑七：只配副本数，不配 `acks` 和 ISR

`replication.factor=3` 只是说明每个 partition 有三个副本。它不保证 producer 每次写入都等到多个副本确认。

关键 topic 至少要同时考虑：

```text
replication.factor
min.insync.replicas
producer acks
producer retries
enable.idempotence
unclean leader election 策略
```

如果只设置副本数，却让 producer 用 `acks=1`，可靠性预期会和实际行为不一致。

#### 坑八：Consumer Lag 只看总数

总 lag 是一个粗指标。排查问题时要按 group、topic、partition 拆开看。

例如：

```text
partition 0 lag = 10
partition 1 lag = 8
partition 2 lag = 200000
partition 3 lag = 12
```

这不是整体消费能力略慢，而是 partition 2 有明显问题。可能是 hot key、该 partition 被分配到慢 consumer、下游处理异常，或者某些消息触发了慢路径。

#### 坑九：Retention 配错

Kafka 能重放的前提是数据还在。

Retention 配太短，慢消费者或停机修复期间可能错过数据。Retention 配太长，磁盘水位、恢复时间和迁移成本都会上升。

关键 topic 的 retention 应该从业务问题倒推：

- 下游最长允许停机多久？
- 修复 bug 后需要回放多久的数据？
- 审计和合规要求是什么？
- 磁盘容量和副本成本是否可接受？
- 超过 retention 后是否有归档到对象存储或湖仓？

#### 坑十：误用 Compact Topic

Compact topic 适合保留每个 key 的最新状态，不适合完整流水。

如果你把订单审计事件放进 compact topic，后续想追溯每一次状态变化时，可能发现旧版本已经被清理。没有稳定 key 的消息也无法被有效 compact。

Compact topic 要明确回答两个问题：

- 这个 topic 是否只关心每个 key 的最新值？
- 旧版本被后台清理后，业务是否仍然正确？

#### 坑十一：把 Kafka 当同步 RPC

Kafka 可以用 request topic 和 reply topic 模拟请求响应，但这会引入很多额外复杂度：

- correlation id。
- 请求超时。
- 重复请求。
- 重复响应。
- reply topic 分区与消费者实例映射。
- 调用链追踪。
- 下游扩容和失败处理。

如果业务本质是同步查询或命令，HTTP/gRPC 往往更直接。Kafka 更适合表达“某件事已经发生了”，而不是“我现在要调用你并立即等结果”。

### 全流程速览

把 Kafka 串起来看，可以得到这样一条链路：

```text
Producer
  -> 根据 topic metadata 找到 partition leader
  -> 根据 key/partitioner 选择 partition
  -> batch + compression
  -> 写入 leader 的 partition log
  -> follower 复制进入 ISR
  -> 根据 acks 返回结果

Broker
  -> 以 segment 保存 partition log
  -> 用 offset index/time index 辅助查找
  -> 按 retention 或 compaction 清理旧数据

Consumer Group
  -> group coordinator 分配 partition
  -> consumer 从指定 offset fetch
  -> 业务处理
  -> 提交 offset 到 __consumer_offsets
  -> rebalance 时重新分配 partition
```

Kafka 的关键不是“消息传得快”，而是它把事件保存成可复制、可分区、可回放的日志。Topic 是业务入口，partition 是顺序和并行的边界，offset 是消费者的位置，retention 决定历史还能保留多久，replica 和 ISR 决定故障时的数据安全边界。

理解这些机制之后，很多问题都会变得清晰：

- 为什么 Kafka 只保证 partition 内有序。
- 为什么 consumer 数量超过 partition 数量后不会继续提升并行度。
- 为什么消息可能重复。
- 为什么 offset 提交比 ack 更容易被误解。
- 为什么 retention 配错会让回放能力消失。
- 为什么 compact topic 不是数据库。
- 为什么 Kafka 和 RabbitMQ 不是简单替代关系。

如果系统的核心需求是保存和分发事实事件，Kafka 会成为稳定的数据中枢。如果把它当普通队列、死信任务系统或同步 RPC，它的优势反而会变成复杂度。

### 参考资料

- [Apache Kafka Introduction](https://kafka.apache.org/40/getting-started/introduction/)
- [Apache Kafka Design](https://kafka.apache.org/40/design/design/)
- [Apache Kafka Log Implementation](https://kafka.apache.org/40/implementation/log/)
- [Apache Kafka KRaft](https://kafka.apache.org/40/operations/kraft/)
- [Apache Kafka Producer Configs](https://kafka.apache.org/40/configuration/producer-configs/)
- [Apache Kafka Consumer Configs](https://kafka.apache.org/40/configuration/consumer-configs/)
- [Apache Kafka Topic Configs](https://kafka.apache.org/40/configuration/topic-level-configs/)
- [Kafka: a Distributed Messaging System for Log Processing](https://notes.stephenholiday.com/Kafka.pdf)
- [The Log: What every software engineer should know about real-time data's unifying abstraction](https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying)
