---
title: How it works - 消息中间件
category: 系统运维
---

消息中间件最容易被低估。刚开始看，它只是一个“临时存消息的队列”；真正放到分布式系统里，它解决的是服务之间如何异步协作、如何削峰填谷、如何把失败隔离在局部、如何让多个下游系统在不互相阻塞的情况下消费同一份业务事实。

但消息中间件也最容易被滥用。它不是分布式事务的万能补丁，也不是把同步调用换成异步调用就自动变可靠。消息一旦离开生产者，系统里就会出现新的问题：消息会不会丢、会不会重复、顺序如何保证、失败如何重试、堆积如何处理、消费者变慢会不会拖垮 broker、跨机房复制和网络分区时应该牺牲什么。

### 消息中间件解决什么问题

消息中间件的核心作用，是在生产者和消费者之间放一个可靠的异步边界。

没有消息中间件时，一个订单服务如果要通知库存、支付、积分、风控、搜索索引和短信系统，最直接的做法是逐个同步调用：

```text
order service
  -> inventory service
  -> payment service
  -> points service
  -> search index service
  -> sms service
```

这个模型的问题很明显：调用链变长，任何一个下游变慢都会拖慢订单服务；下游短暂不可用时，上游要么失败，要么自己实现重试、缓冲、超时、补偿和幂等；新增一个下游也要改上游发布逻辑。

引入消息中间件后，上游只发布“订单已创建”“订单已支付”这样的事件，下游按自己的节奏订阅和处理：

```text
order service -> message broker -> inventory / points / search / notification
```

这样做带来几个关键收益。

第一，**解耦**。生产者不需要知道所有消费者是谁，只需要定义清楚消息语义。新增搜索索引、数据仓库、审计系统时，不必让订单服务逐个调用它们。

第二，**削峰填谷**。当流量突然升高时，broker 可以先承接一部分消息，让消费者按处理能力逐步消化。队列深度变成系统压力的缓冲区。

第三，**失败隔离**。下游短暂故障时，消息可以留在队列中重试，或者进入死信队列等待人工/自动补偿，而不是让上游请求全部失败。

第四，**广播与多订阅**。同一个业务事件可以被多个系统独立消费，例如订单事件同时进入搜索、数仓、风控、通知系统。不同下游不必共享处理进度。

第五，**异步工作流**。一些耗时任务不适合放在用户请求链路中，例如生成报表、发送邮件、同步第三方系统、压缩图片、批量出账。消息队列可以把这些工作从在线链路中拆出去。

![消息中间件在系统中的位置](img/posts/message-middleware-use-cases.svg)

不过，引入消息中间件也意味着系统从“调用失败”变成了“消息状态不确定”。工程上必须承认三件事：

- 大多数消息系统默认更接近 **at-least-once**，消费者要能处理重复消息。
- 顺序通常只能在某个局部范围内保证，例如单队列、单分区、单 key。
- 可靠性不是 broker 单独提供的，而是 producer、broker、consumer、存储、网络和业务幂等共同组成的链路。

### RabbitMQ 的基本概念和架构

RabbitMQ 是最典型的队列型消息中间件之一。它的经典模型来自 AMQP 0-9-1：生产者把消息发给 `exchange`，exchange 根据规则把消息路由到一个或多个 `queue`，消费者从 queue 中取消息并确认处理结果。

#### Producer、Exchange、Binding、Queue、Consumer

RabbitMQ 中最重要的几个概念是：

- `producer`：生产者，负责发布消息。
- `exchange`：交换机，负责接收生产者发来的消息，并根据类型和 binding 决定投递到哪些 queue。
- `binding`：绑定关系，把 exchange 和 queue 连接起来，通常还带有 routing key 或匹配规则。
- `queue`：队列，真正保存消息并向消费者投递。
- `consumer`：消费者，从 queue 接收消息并处理。
- `message`：消息本体，通常包含 body、properties、headers、routing key 等信息。

这几个概念的关系可以这样理解：

```text
producer -> exchange --binding--> queue -> consumer
```

生产者通常不直接把消息发到 queue，而是发到 exchange。exchange 不保存消息，它只负责路由。queue 才是消息等待消费的地方。

![RabbitMQ AMQP 路由模型](img/posts/rabbitmq-amqp-routing-architecture.svg)

#### Exchange 类型

RabbitMQ 常见 exchange 类型有四种。

`direct exchange` 按 routing key 精确匹配。生产者发布消息时带上 routing key，只有 binding key 与它匹配的 queue 才会收到消息。它适合按状态、类型、租户、业务线做明确分发。

`fanout exchange` 不看 routing key，会把消息投递到所有绑定的 queue。它适合广播，例如配置变更、缓存失效、事件通知。

`topic exchange` 支持通配符匹配。binding key 可以使用 `*` 匹配一个单词，使用 `#` 匹配零个或多个单词。例如 `order.*`、`order.#`。它适合层级化事件路由。

`headers exchange` 根据消息 headers 做匹配。它不依赖 routing key，适合路由条件比较复杂但吞吐要求不高的场景。

实际系统中，最常见的是 direct、topic、fanout。headers exchange 因为匹配成本和理解成本较高，使用频率相对低。

#### Queue 类型

RabbitMQ 现在不能只理解为“一个 queue 类型”。不同队列类型面向的目标不同。

`classic queue` 是历史上最常见的队列类型，适合普通任务队列、工作队列和路由场景。它理解简单，生态成熟。

`quorum queue` 面向更高的数据安全和可用性。它使用基于 Raft 思路的复制日志，队列有一个 leader 和多个 follower，写入需要复制到多数副本。代价是写入延迟和资源占用会比单副本 classic queue 更高。

`stream` 面向日志式、可保留、可重放的事件流。它更接近追加日志模型，适合大规模顺序写入和多个消费者按 offset 读取。但如果需求只是传统任务队列，stream 不一定是更简单的选择。

选择队列类型时，需要思考消息的生命周期是什么：消费成功后就可以删除，还是需要长期保留和重放？是追求低延迟任务分发，还是追求多副本数据安全？是一个消费者组抢任务，还是多个消费者独立读取历史？

#### Connection、Channel、Virtual Host

RabbitMQ 客户端通常先建立 TCP connection，再在 connection 上创建多个 channel。channel 是 AMQP 操作的轻量逻辑通道。生产者发布、消费者订阅、ack、confirm 等操作都发生在 channel 上。

为什么需要 channel？因为 TCP connection 相对重，频繁建立和关闭代价高；而一个应用进程里可能有多个线程或多个逻辑生产/消费单元。用多个 channel 复用一个 connection，可以减少连接数量。

`virtual host` 是 RabbitMQ 的逻辑隔离单元。不同 vhost 下的 exchange、queue、binding、权限彼此隔离。多业务共用一个 RabbitMQ 集群时，通常会按环境或业务划分 vhost，再配合用户权限限制访问范围。

### RabbitMQ 的工作原理

#### 发布与路由

生产者发布消息时，通常会指定 exchange、routing key、properties 和 body。broker 收到 `basic.publish` 后，会找到对应 exchange，并根据 exchange 类型和 binding 规则决定目标 queue。

如果消息没有路由到任何 queue，结果取决于发布参数和 exchange 配置：

- 普通情况下，消息可能被直接丢弃。
- 如果 producer 使用 mandatory 标记，broker 可以把不可路由消息返回给 producer。
- 也可以配置 alternate exchange，让不可路由消息进入兜底 exchange。

这说明 RabbitMQ 的可靠性从发布阶段就开始了。producer 不能只假设“我调用 publish 成功了，消息就一定有人处理”。更严谨的做法是：

1. 使用 publisher confirms 确认 broker 已经接收并处理发布。
2. 对不可路由消息启用 mandatory 或 alternate exchange。
3. 业务上保留消息发送记录或 outbox，处理 producer 进程崩溃时的不确定状态。

#### 入队、持久化与确认

消息路由到 queue 后，会进入队列等待投递。是否能在 broker 重启后保留下来，取决于几个条件共同成立：

- queue 是 durable 的。
- message 是 persistent 的。
- 使用的队列类型和存储配置支持相应持久化语义。
- producer 等到了足够可靠的确认，而不是发送后立即认为成功。

如果只把 queue 声明为 durable，但消息不是 persistent，那么 broker 重启后消息仍可能丢失。如果消息是 persistent，但 producer 没有等待 confirms，那么 producer 进程看到的“发送成功”也可能只是写入 socket 成功，不等于 broker 已安全处理。

Quorum queue 的确认语义更强一些：写入通常需要复制到多数副本后才确认。但它也不是免费的，写入路径会经过复制协议，延迟、磁盘 I/O、网络和副本状态都会影响吞吐。

#### 消费、Ack、Nack 与重投

消费者可以通过 `basic.consume` 订阅队列，RabbitMQ 会把消息推送给 consumer。consumer 处理完成后，向 broker 发送 ack。broker 收到 ack 后，才可以把这条消息从未确认集合中移除。

如果 consumer 在 ack 前断开连接，broker 会认为这条消息没有处理完成，通常会重新投递给其他 consumer。这就是 RabbitMQ 常见的 at-least-once 语义来源：为了避免丢消息，broker 会选择重投；而重投意味着消费者可能看到重复消息。

消费者失败时，可以：

- `ack`：表示处理成功。
- `nack/reject requeue=true`：表示处理失败，但重新入队。
- `nack/reject requeue=false`：表示不再重新入队，如果配置了 dead letter exchange，则进入死信路径。

盲目 `requeue=true` 很危险。如果消息本身有毒，例如格式错误、业务校验永远失败，它会不断被重新投递，形成热循环。生产系统通常要限制重试次数，把超过次数的消息送入死信队列，再由补偿任务或人工处理。

RabbitMQ 还有一个容易被忽略的保护机制：delivery acknowledgement timeout。它用来发现长时间不 ack 的 consumer，避免消息一直处于未确认状态。默认超时时间是 30 分钟；如果 consumer 在超时时间内没有 ack，RabbitMQ 会关闭对应 channel，并把该 channel 上未确认的 delivery 重新入队。因此，处理耗时长的业务要保证单条消息处理时间明显小于超时时间，或者显式调大 `consumer_timeout`。

> NOTE: RabbitMQ 4.3 起，delivery acknowledgement timeout 只支持 quorum queue。
{:.note}

使用 Spring Boot 时，一般使用 Spring AMQP（`spring-boot-starter-amqp`）来包装。它的核心思路是：用注解订阅队列，再通过 acknowledge 模式控制 ack/nack 的语义。

订阅消息最常用的方式是 `@RabbitListener`，它会自动建立 `basic.consume` 并把消息回调到方法上：

```java
@Configuration
public class RabbitConfig {

    @Bean
    public SimpleRabbitListenerContainerFactory orderFactory(
            ConnectionFactory cf) {
        SimpleRabbitListenerContainerFactory f =
                new SimpleRabbitListenerContainerFactory();
        f.setConnectionFactory(cf);
        f.setAcknowledgeMode(AcknowledgeMode.MANUAL); // 手动确认
        f.setPrefetchCount(50);                         // 等价 prefetch
        return f;
    }
}

@Component
public class OrderConsumer {

    // 订阅队列并消费，channel 用于手动确认
    @RabbitListener(queues = "order.queue", containerFactory = "orderFactory")
    public void onMessage(Order order, Channel channel,
                          @Header(AmqpHeaders.DELIVERY_TAG) long tag)
            throws IOException {

        try {
            handle(order);
            // 处理成功 → ack，broker 才会把消息从未确认集合移除
            channel.basicAck(tag, false);

        } catch (RetryableException e) {
            // 处理失败但可重试 → nack 并 requeue
            // false 表示只确认当前这条消息
            channel.basicNack(tag, false, true);

        } catch (UnrecoverableException e) {
            // 处理失败且不可重试 → nack 不 requeue
            // 配合 DLX，消息会进入死信队列
            channel.basicNack(tag, false, false);
        }
    }
}
```

`AcknowledgeMode` 三种模式决定了谁来发 ack：

- `AUTO`（默认）：方法正常返回即 ack，抛异常即 nack。最省事，但 requeue/重试策略不够细。
- `MANUAL`：在方法里显式调用 `channel.basicAck` / `basicNack`，控制最精细，是生产系统推荐做法。
- `NONE`：broker 投递即视为成功，无确认。吞吐最高，但丢消息风险大，仅适合可丢失场景。

几点实际中容易踩坑的地方：

- `basicAck/basicNack` 的第二个参数 `multiple`，false 只确认 `deliveryTag` 这一条，true 会顺带确认该 tag 之前的所有未确认消息，多线程消费时慎用 true。
- 手动模式下如果方法里忘了 ack/nack，消息会一直留在未确认集合里，直到连接断开才会重投，容易表现为“消息卡住”。
- 抛异常让 Spring 自动 nack 时，默认会 `requeue=true`，毒消息会无限重试；应配合 `RetryTemplate`、`MessageRecoverer` 或死信队列控制重试次数。
- 业务幂等要与 ack 分开做：ack 只保证“broker 不再重投当前这条”，不保证同一笔业务不会被重复处理（重启、网络抖动都可能重投）。

也就是说，Spring 把“订阅、确认、重试”这三件事分成了 `@RabbitListener`、`AcknowledgeMode`、`RetryTemplate`/`MessageRecoverer` 几个独立配置，理解清楚每一层的边界，比单看 ack/nack 两个方法更重要。

![RabbitMQ 发布、路由、消费与确认流程](img/posts/rabbitmq-publish-consume-flow.svg)

#### Prefetch 与背压

RabbitMQ 是 push 模型，broker 会主动把消息推给 consumer。为了避免某个 consumer 一次拿走过多消息，AMQP 提供了 prefetch 机制。

`prefetch` 可以理解为“一个 consumer/channel 同时最多持有多少条未 ack 消息”。如果 prefetch 太大，单个 consumer 可能堆积大量未处理消息，导致内存压力和负载不均；如果 prefetch 太小，网络往返和调度开销会限制吞吐。

一个常见经验是：

- 处理很快、幂等、消息小：prefetch 可以适当大一些，提高吞吐。
- 处理很慢、外部调用多、消息大：prefetch 应该小一些，避免单个 consumer 占住过多消息。
- 希望更公平地分摊任务：prefetch 不宜过大。

RabbitMQ 还会通过内存水位、磁盘水位、连接阻塞等机制保护 broker。生产者看到发布变慢或连接被阻塞时，不应该简单加线程硬顶，而要先看队列堆积、磁盘、内存、消费者速率和下游依赖。

#### 顺序性与重复消费

RabbitMQ 单队列在理想情况下可以按入队顺序投递，但这不等于业务上永远严格有序。以下情况都会影响顺序：

- 一个 queue 有多个 consumer 并发处理。
- 某条消息处理失败后重新入队。
- 使用优先级队列。
- 消费者 prefetch 较大，消息已经分发到不同 consumer 的未确认窗口中。
- 死信、延迟、重试路径改变了消息回来的时间。

因此，如果业务强依赖顺序，最好把“顺序范围”定义清楚。例如同一个订单的事件进入同一个专用队列或同一个顺序分片，并且对应消费者按序处理。不要把“整个系统全局有序”作为默认假设。

重复消费也一样。只要使用 ack + 重投机制，就要假设消费者可能重复收到同一条消息。常见做法包括：

- 消息带业务唯一 ID，例如 `order_id + event_type + version`。
- 消费者处理前先检查幂等表或业务状态。
- 外部副作用与消费位点更新放在同一个本地事务中，或者使用 outbox/inbox 模式。
- 对可重试和不可重试错误做区分，避免无意义重试。

### RabbitMQ 部署

部署 RabbitMQ 时，最重要的问题不是“起几个节点”，而是“哪些队列要承受什么语义和负载”。不同队列类型、复制方式、消息大小、消费者速度，会把同一个集群推向完全不同的瓶颈。

#### 单节点、集群与队列位置

开发和测试环境可以用单节点 RabbitMQ。生产环境如果要高可用，通常会使用 RabbitMQ cluster，并为关键队列选择合适的复制队列类型。

RabbitMQ 集群把多个节点组成一个逻辑 broker，元数据在节点间共享。客户端可以连到集群任意节点，但队列有实际所在节点或 leader。访问非本地队列时，消息可能需要跨节点转发。

这带来一个部署层面的原则：集群不是简单地把所有流量平均到所有节点。队列 leader 分布、连接入口、消费者位置、跨节点路由都会影响实际负载。生产环境要关注每个节点的消息速率、队列 leader 分布、磁盘 I/O、网络流量和内存。

#### Quorum Queue 的部署模型

对于关键业务消息，quorum queue 是 RabbitMQ 中更常见的高可用选择。一个 quorum queue 有一个 leader 和多个 follower。写入到 leader 后，会复制到 follower；达到多数派后，写入才算被确认。

![RabbitMQ quorum queue 部署模型](img/posts/rabbitmq-quorum-queue-deployment.svg)

Quorum queue 的几个部署要点：

- 副本数通常用奇数，例如 3 或 5。3 副本可以容忍 1 个副本不可用，5 副本可以容忍 2 个副本不可用。
- 副本越多，数据安全和容错能力越强，但写入复制成本越高。
- quorum queue 依赖多数派。网络分区时，少数派不能继续安全接受写入。
- 不要把所有副本放在同一台物理机、同一块盘或同一个故障域里。

这和“开更多副本就一定更快”相反。RabbitMQ 的 replica 首先是可靠性和可用性工具，不是免费扩容工具。读写热点仍然可能集中在 leader 上，队列数量、leader 分布和消费者并发需要一起设计。

#### 容量规划

RabbitMQ 容量规划至少要回答这些问题：

- 峰值发布速率是多少？平均消息大小是多少？
- 消费者正常处理速率是多少？下游故障时能允许堆积多久？
- 消息是否必须持久化？是否使用 quorum queue？
- 队列最大长度、消息 TTL、死信策略如何设置？
- 每个连接、channel、consumer 的数量规模是多少？
- 是否有大消息？是否应该把大 payload 放对象存储，只在消息里传引用？
- 是否有严格顺序需求？是否会限制消费者并发？

一个实用的估算方式是从堆积窗口倒推磁盘：

```text
required_disk ~= peak_in_messages_per_second
              * average_message_size
              * tolerated_backlog_seconds
              * replica_count
              * safety_factor
```

这个公式很粗糙，但能提醒我们：消息中间件不是黑洞。下游停 30 分钟、每秒 2 万条、每条 4KB、3 副本，磁盘和 I/O 压力会非常真实。没有容量规划的“削峰填谷”，最后会变成“把故障延后爆炸”。

#### 监控与告警

RabbitMQ 的核心监控不应该只看节点是否存活。至少要看：

- publish / deliver / ack 速率。
- ready、unacked、total message 数。
- consumer 数量与 consumer utilisation。
- 每个队列的堆积时间，而不只是堆积条数。
- redelivered、nack、dead letter 数。
- connection、channel、queue 数量。
- memory watermark、disk free alarm、file descriptors。
- quorum queue leader 分布、follower 状态、复制延迟。

告警也要避免只按“队列深度超过 N”触发。不同队列的消息大小、业务优先级和消费速率不同。更好的告警方式是结合业务 SLO：某队列最老消息年龄超过 5 分钟、ack 速率低于发布速率持续 10 分钟、死信增长异常、消费者数量为 0 等。

### RabbitMQ 与其它消息中间件对比

消息中间件没有绝对的“最好”。它们只是把不同问题放在了第一优先级。

RabbitMQ 的第一优先级是灵活路由、任务队列、确认和投递控制。Kafka 的第一优先级是高吞吐分区日志、保留和重放。RocketMQ 更贴近业务消息，内置顺序、事务、延时、重试等常用能力。ActiveMQ 在 JMS 和多协议兼容上有历史优势。Pulsar 强调存储计算分离、多租户和流队列融合。NATS JetStream 强调轻量、低延迟和云原生通信。Redis Streams 更像 Redis 生态里的轻量消息流。SQS 则把自建 broker 的运维交给云服务。

![常见消息中间件定位对比](img/posts/message-middleware-comparison-map.svg)

| 系统 | 核心抽象 | 最适合的场景 | 主要取舍 |
| --- | --- | --- | --- |
| RabbitMQ | exchange、binding、queue | 任务队列、复杂路由、按消息 ack、死信与重试 | 高吞吐事件回放不是经典队列模型的强项；高可用队列有复制成本 |
| RocketMQ | topic、message queue、consumer group | 电商/交易类业务消息、顺序消息、事务消息、延时消息、重试 | 生态和运维模型更偏 RocketMQ 自身体系，跨语言/云服务选择要评估 |
| ActiveMQ Classic | JMS queue/topic | 传统 Java/JMS 系统、老系统兼容 | 架构历史较久，新项目通常要比较 Artemis 或其它系统 |
| ActiveMQ Artemis | address、routing type、queue | JMS + AMQP/MQTT/STOMP/OpenWire 多协议 broker | 需要理解 address model、HA、journal、分页等体系 |
| Kafka | topic、partition、offset log | 高吞吐事件流、日志、CDC、流处理、多消费者重放 | 复杂消息路由、单条任务确认、任意延时重试不是核心强项 |
| Pulsar | broker + BookKeeper、topic、subscription | 多租户、大规模事件流、存储计算分离、分层存储 | 架构组件更多，部署和运维复杂度高于单体 broker |
| NATS JetStream | stream、subject、consumer | 轻量服务通信、低延迟 pub/sub、持久化事件流 | 生态模型不同于 AMQP/JMS；复杂企业消息能力需评估 |
| Redis Streams | stream、consumer group | Redis 体系内的轻量队列、简单任务流 | 容量、保留、持久化、故障恢复受 Redis 模型约束 |
| Amazon SQS | managed queue | 云上异步任务、削峰、不想自管 broker | 功能边界由云服务定义；本地复杂路由和协议兼容不是重点 |

#### RabbitMQ vs ActiveMQ

ActiveMQ 是开源消息中间件里很老牌的一类。Classic 系列源自 Apache 早期的 JMS broker，长期服务于 Java/JMS 生态（queue/topic、持久订阅、事务、Spring 集成），市面上仍有不少存量系统运行在它上面。ActiveMQ Artemis 是更现代的实现（从 JBoss HornetQ 捐赠并入），支持异步非阻塞 journal、多协议（AMQP/MQTT/STOMP/OpenWire）、address/routing type/queue 模型，官方把它定位为「下一代」ActiveMQ。

新项目中，ActiveMQ/Artemis 更适合有 JMS、多协议兼容或存量迁移约束的场景。如果只是通用任务队列、复杂路由或事件流，应同时比较 RabbitMQ、Kafka、RocketMQ、NATS 等方案；如果选择 ActiveMQ 体系，也要明确是在延续 Classic，还是直接采用 Artemis。

#### RabbitMQ vs Kafka

Kafka 的设计哲学与 RabbitMQ 完全不同。它最初是 LinkedIn 内部约 2010 年的产物，要解决的问题是：海量的日志、用户行为、监控指标这些事件数据，需要同时被实时计算、数据仓库、搜索、风控、备份等多个下游消费。传统 MQ（AMQP / JMS 那套 exchange、binding、per-message ack 影响删除、事务、优先级）做太多协调逻辑，吞吐扛不住这种规模。

Kafka 给出了一个很关键的**理念上的取舍：简化 broker，把决定权交给客户端**。broker 不再做「记住每条消息被谁 ack 了、谁该重投、什么时候删除」这些簿记，它退化成两件事：把消息按顺序追加写入分区日志、按消费者要求的位置把日志读出来。其它复杂事情——消费到哪了（offset）、要不要重放历史、要不要重处理失败的消息——统统交给客户端自己管。

几个具体的例子：

- **offset 由 consumer 自己 commit**：broker 不跟踪每条消息的 ack 状态，consumer 处理完一段就自己把 offset 提交上去。想重新跑一遍历史，把 offset 往前回退即可。
- **消费成功不等于删除**：消息删不删除，跟某个 consumer 有没有处理过它无关，只看 topic 的保留策略（按时间/大小）或 compact 策略。
- **多订阅者互不干扰**：同一个 topic 可以被 N 个 consumer group 各按自己的进度消费，谁先谁后、跑几遍都行。

这样做的收益很直接：broker 不必维护每条消息的确认状态机和 per-consumer 重投追踪，复杂度大幅下降，剩下的就是单纯地顺序写磁盘和读磁盘，配上零拷贝，单机就能做到很高的吞吐。

这套设计让 Kafka 和 RabbitMQ 落在两个完全不同的场景上：消息在 RabbitMQ 里像一项「任务」——投递、确认、失败重试、死信、复杂路由，强调可靠的任务分发；在 Kafka 里像一笔「事件日志」——追加写入并长期保留，多个下游按各自 offset 独立读取和重放，强调高吞吐与历史回放。

所以选择 Kafka 还是 RabbitMQ？要看实际诉求：订单创建后异步发短信、扣积分、更新搜索索引，更偏任务投递，RabbitMQ 更自然；订单事件要同时进入实时计算、湖仓、风控、审计、搜索，且未来可能重放历史，Kafka 更自然。

#### RabbitMQ vs RocketMQ

在大多数业务场景里，RabbitMQ 就够用了。任务队列、服务解耦、广播通知、削峰填谷，它都能干净利落地完成。但是，当系统开始大量做“交易类业务”时，会碰到 RabbitMQ 不太顺手的地方。

RocketMQ 最早是阿里巴巴的 MetaQ，思路借鉴自 Kafka 的分区日志模型，不是 AMQP 的 exchange/binding 路由。它出现的原因很直接：电商和交易场景里有一类高频诉求——保证本地事务与消息发送的原子性、消息要能延时投递、同一笔业务的消息要严格有序、消息可能需要回溯重放——而用 RabbitMQ 做这些，往往要靠 DLX + TTL、outbox 表、外部存储自己拼，复杂度会全部堆到业务代码里。RocketMQ 选择把这几件事直接做进 broker。

> **NOTE**：什么是「保证本地事务与消息发送的原子性」？
>
> 本地数据库的事务和「向 broker 发一条消息」是两个独立的数据源、两次独立的状态变更，能不能做到**要么都成功、要么都不发生**，而不出现下面两种不一致的中间态：
>
> - 本地事务提交了，但消息没发出去（下游永远不知道这笔业务发生过）。
> - 消息发出去了，但本地事务没落库（下游收到一个「幽灵事件」，业务事实并不存在）。
>
> 这是一个典型的 dual-write（双写）问题：两个数据源无法用同一个本地事务原子提交。理论上 XA 两阶段提交能跨 DB 和 broker 做强分布式事务，但代价太大、资源锁定时间长，工程上几乎没人在 MQ 场景使用。所以业界普遍退到应用层模式来解决这件事，常见的有两条路：
>
> - **outbox（本地消息表）**：在同一个本地事务里同时写业务表和一张「待发消息表」，事务提交后用后台线程可靠地把消息表内容投递到 broker。broker 不参与事务，原子性靠「同事务写入 + 后台补发」拼出来。RabbitMQ 通常用这种模式。
> - **事务消息 + 回查**：broker 自己内置一套协调机制，先存「半消息」对消费者不可见，等 producer 决定本地事务结果后再 commit / rollback；若第二次确认丢失，broker 主动回查 producer。RocketMQ 用这种模式。
{:.note}

相对 RabbitMQ，RocketMQ 的主要优势在以下几点：

- **事务消息（带回查）**。这是 RocketMQ 最有辨识度的能力。producer 先发一条“半消息（half message）”到 broker，broker 标记为暂不投递；producer 接着执行本地事务，再通知 broker commit 或 rollback。如果第二次确认因为网络断开或 producer 重启丢了，broker 会主动回查 producer，让它根据本地业务表（例如 order 表能不能查到这笔订单）判断这笔事务到底成没成。这样把“本地事务 + 发消息”的一致性问题收进了 broker，应用层不再需要自己写 outbox。
- **内置延时/定时消息**。订单超时关单、定时任务触发这类诉求，在 RabbitMQ 里通常要靠 DLX + TTL 或插件近似实现，边界条件不少。RocketMQ 5.x 支持按投递时间戳设置定时/延时消息，不再局限于固定延时级别；但要使用支持定时消息的 topic，并受最大定时时间、时间精度等约束。
- **顺序消息**。RocketMQ 以 `message group` 作为顺序边界，可保证同一 message group 内消息 FIFO。实践中通常用 `orderId`、`userId` 这类业务标识作为 message group，并让同一组消息按序发送和处理，binlog 同步、状态机推进这类场景更省心。
- **重试与死信开箱即用**。RabbitMQ 的重试/死信需要自己配 DLX、设重试上限、处理 requeue；RocketMQ 把重试次数、退避、死信队列做成消费组级别的配置，业务侧几乎不用关心重试编排。
- **消息可回溯**。RocketMQ 基于分区日志和 offset，消费后消息不会立即删除，可在保留期内重放历史。RabbitMQ classic/quorum queue 通常不是为历史回放设计，消费确认后消息可被删除。
- **高吞吐**。分区日志追加写的天然优势，在大量事件流场景下，单机吞吐明显高于 RabbitMQ 的经典队列。

所以在选型时，可以按下面这条线判：

- 用 **RabbitMQ**：任务队列、工作队列、复杂路由、异构消费者、多协议接入、服务解耦、广播通知。这是它的舒适区。
- 用 **RocketMQ**：交易类业务需要事务消息、订单超时关闭这类原生延时消息、同一笔业务需要严格有序、海量消息且要历史回溯，或者团队本身就在阿里系 / 国内电商生态里。

一句话：RabbitMQ 像通用消息路由与任务分发器，RocketMQ 像“长在交易业务场景里”的消息平台。先看清核心诉求是不是 RabbitMQ 的短板，再决定是否值得换一套运维体系。

### 常见的坑

#### 坑一：把消息中间件当成分布式事务

消息中间件可以帮助实现最终一致性，但不能自动消除分布式事务问题。

例如订单服务本地事务提交成功后，还要发布 `OrderPaid` 消息。如果本地事务成功、消息发送失败，系统状态就不一致。常见解决方式是 outbox：在同一个本地事务中写业务表和消息表，再由后台任务可靠投递消息。消费者侧则用 inbox 或幂等表处理重复消息。

#### 坑二：消费者不做幂等

只要使用重试、ack、网络超时、consumer 崩溃，就要假设消息会重复。消费者不做幂等，迟早会出现重复扣款、重复发货、重复发券、重复通知。

幂等不是简单地“根据 message id 去重”就结束。还要考虑 message id 谁生成、是否全局唯一、去重记录保留多久、业务状态是否允许重复推进、外部接口是否也幂等。

#### 坑三：无限重试

重试只适合临时错误，例如下游超时、数据库短暂不可用、限流。对于永久错误，例如参数非法、消息 schema 不兼容、业务状态不允许，无限重试只会制造队列堆积。

生产系统要区分可重试错误和不可重试错误，设置最大重试次数、退避策略和死信队列。

#### 坑四：只看队列长度

队列长度 10 万不一定有问题，队列长度 1000 也不一定安全。关键要看消息大小、最老消息年龄、业务 SLA、消费速率和发布速率。

比如每条消息处理 1 秒，队列里有 1000 条且只有 1 个消费者，最晚一条要等 1000 秒。对一个要求 30 秒内完成的任务来说，这已经严重超时。

#### 坑五：把大对象塞进消息

消息中间件适合传事件、命令和小 payload，不适合传几十 MB 的文件。大消息会占用 broker 内存、磁盘、网络和复制带宽，也会拖慢消费者。

更常见的方式是把大对象放到对象存储或文件系统，消息里只传对象地址、版本、校验和和必要元数据。

#### 坑六：不管理 Schema

消息一旦被多个系统消费，就变成了系统间契约。随意改字段名、删除字段、改变语义，都会让下游在未来某个时间失败。

消息 schema 应该版本化。新增字段通常比修改字段安全；删除字段要有兼容期；语义变化应该发布新事件类型或新版本。

#### 坑七：忽视消费者速度

很多消息系统事故不是 broker 突然坏了，而是下游变慢后，上游仍按峰值写入。队列开始堆积，磁盘被打满，broker 进入保护模式，最后影响所有业务。

消息中间件只能缓冲有限时间。容量规划必须包含“消费者停摆多久还能扛住”和“恢复后多久能追平”。

### 全流程速览

以 RabbitMQ 为例，一条可靠消息链路大致是：

```text
producer
  -> 生成带业务唯一 ID 的消息
  -> basic.publish 到 exchange
  -> exchange 根据 binding 路由到 queue
  -> queue 持久化或复制
  -> broker 发送 publisher confirm
  -> consumer 按 prefetch 接收消息
  -> consumer 处理业务并保证幂等
  -> consumer ack
  -> 失败时按策略重试或进入 dead letter queue
```

从这个流程看，消息系统的可靠性来自一整条链路：

1. 生产者要知道消息是否真正被 broker 接受。
2. Broker 要正确路由、持久化、复制和限流。
3. 消费者要 ack 正确、处理幂等、区分重试和死信。
4. 运维要监控堆积、速率、最老消息年龄、资源水位和复制状态。
5. 业务要接受最终一致性，并设计补偿和对账。

消息中间件的价值不是“让系统永远不失败”，而是把失败变成可观察、可重试、可隔离、可补偿的状态。当我们按这个思路设计时，RabbitMQ、RocketMQ、Kafka 等系统各有清晰的位置；当我们把它当成魔法缓冲层时，队列只是把问题藏起来，等流量和故障同时到来时再放大。

### 参考资料

- [RabbitMQ: AMQP 0-9-1 Model Explained](https://www.rabbitmq.com/tutorials/amqp-concepts)
- [RabbitMQ: Queues](https://www.rabbitmq.com/docs/queues)
- [RabbitMQ: Consumer Acknowledgements and Publisher Confirms](https://www.rabbitmq.com/docs/confirms)
- [RabbitMQ: Quorum Queues](https://www.rabbitmq.com/docs/quorum-queues)
- [RabbitMQ: Clustering](https://www.rabbitmq.com/docs/clustering)
- [RabbitMQ: Consumer Prefetch](https://www.rabbitmq.com/docs/consumer-prefetch)
- [Apache RocketMQ: Domain Model](https://rocketmq.apache.org/docs/domainModel/01main)
- [Apache RocketMQ: FIFO Message](https://rocketmq.apache.org/docs/featureBehavior/03fifomessage)
- [Apache RocketMQ: Transaction Message](https://rocketmq.apache.org/docs/featureBehavior/04transactionmessage)
- [Apache RocketMQ: Scheduled Message](https://rocketmq.apache.org/docs/featureBehavior/02delaymessage)
- [Apache ActiveMQ Classic](https://activemq.apache.org/components/classic/)
- [Apache ActiveMQ Artemis](https://activemq.apache.org/components/artemis/)
- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [Apache Pulsar Documentation](https://pulsar.apache.org/docs/)
- [NATS JetStream](https://docs.nats.io/nats-concepts/jetstream)
- [Redis Streams](https://redis.io/docs/latest/develop/data-types/streams/)
- [Amazon SQS Developer Guide](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html)
