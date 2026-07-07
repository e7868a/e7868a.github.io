---
title: How it works - HDFS
category: 系统运维
---

HDFS 全称 Hadoop Distributed File System，是 Apache Hadoop 项目的核心分布式存储组件。它受 2003 年 Google 发表的《The Google File System》论文启发，早期从 Nutch/Hadoop 项目演进而来。HDFS 是现代大数据处理的存储基础，为 MapReduce、Spark、Hive、Flink、HBase 等上层计算、查询和存储系统提供高吞吐、高可靠的大文件存储能力。

Hadoop 是 Apache 基金会的开源大数据处理框架。它的早期设计主要受 Google 公开的 GFS（分布式文件系统）和 MapReduce（分布式计算模型）论文影响。Hadoop 的目标是让由普通机器组成的集群也能存储和处理 PB 级别的大数据。

Hadoop 的核心能力通常包括几部分：Hadoop Common 提供公共库和工具，HDFS 提供分布式存储，YARN 负责集群资源管理和任务调度，MapReduce 提供基础的分布式数据处理模型。围绕这些核心能力，Hadoop 生态又发展出 Hive（数据仓库）、HBase（NoSQL 数据库）、Pig、Sqoop、ZooKeeper 等一系列组件，共同构成了大数据领域广泛使用的技术栈之一。可以说，Hadoop 是“大数据”这个概念走向工程落地的重要起点，至今仍然被很多数据湖、离线数仓和批处理平台作为底层基础设施。

### HDFS 是什么

HDFS 的核心思想可以用一句话概括：把一个大文件切成多个 block，把 block 的多个副本分散保存到不同机器上，再由一个中心化元数据服务记录“文件由哪些 block 组成、这些 block 在哪些机器上”。

例如一个 400 MB 的文件，如果 block size 是 128 MB，可能会被切成 4 个 block：

```text
/warehouse/orders/day=2025-05-27/part-00000
  -> block 0: 128 MB
  -> block 1: 128 MB
  -> block 2: 128 MB
  -> block 3:  16 MB
```

如果复制因子是 3，每个 block 会保存 3 份副本，分布在不同 DataNode 上。用户看到的是一个完整文件，底层真正存储的是一批 block replica。

这种模型解决了几个核心问题。

第一，文件可以超过单机磁盘容量。一个大文件不必完整放在一台机器上，多个 block 可以分散到整个集群。

第二，吞吐可以横向扩展。不同 block 可以从不同 DataNode 读取，多个任务可以并行扫描不同数据片段。

第三，节点故障不会直接导致数据丢失。只要还有其他副本，NameNode 就可以安排重新复制，把副本数补回来。

第四，计算可以靠近数据。MapReduce、Spark、Hive 等计算框架可以尽量把任务调度到保存目标 block 的机器上，减少跨网络读取。

HDFS 和普通本地文件系统最大的差异在于：本地文件系统主要管理一块磁盘上的 inode、目录和数据块；HDFS 管理的是一个集群里的命名空间、block 映射和副本分布。它更像一个“面向大数据批处理的分布式存储层”。

### 基本概念和架构

HDFS 是典型的 master-worker 架构。NameNode 是元数据中心，DataNode 是实际数据存储节点，Client 通过 HDFS 协议访问两者。

![HDFS 基本架构](img/posts/hdfs-namenode-datanode-architecture.svg)

#### NameNode

NameNode 管理 HDFS 的文件系统命名空间。目录树、文件名、权限、owner、group、mtime、文件到 block 的映射、block 的副本位置、租约状态等，都由 NameNode 维护。

注意，NameNode 不保存文件内容。它保存的是“文件系统长什么样”和“数据块在哪里”。真正的数据 block 在 DataNode 的本地磁盘上。

NameNode 的内存非常关键。HDFS 的命名空间和 block map 需要常驻 NameNode 内存，所以 NameNode 能管理多少文件和 block，很大程度上受内存限制。大量小文件会让 NameNode 压力很大，不是因为小文件本身占用很多磁盘，而是每个文件、每个 block 都会占用元数据。

NameNode 的持久化元数据主要有两类：

- `FsImage`：文件系统命名空间在某个时间点的快照。
- `EditLog`：从这个快照之后发生的元数据修改日志。

NameNode 启动时，会加载 FsImage，再重放 EditLog，恢复出最新命名空间状态。运行过程中，新的 create、delete、rename、setPermission、close file 等操作会追加到 EditLog。

这和很多数据库的 checkpoint + log 思路相似：快照负责缩短恢复时间，日志负责保存最近修改。

#### DataNode

DataNode 负责把 block 保存到本地磁盘，并响应客户端的读写请求。它会定期向 NameNode 发送 heartbeat，告诉 NameNode 自己还活着；也会发送 block report，汇报自己当前保存了哪些 block。

NameNode 根据这些信息维护 block 的副本位置。如果某个 DataNode 长时间没有 heartbeat，NameNode 会认为它不可用，并把它上面的 block replica 视为丢失。只要其他 DataNode 上还有副本，NameNode 就可以调度复制任务，把副本数恢复到目标值。

DataNode 的磁盘通常按多个数据目录配置。假设一台服务器有 8 块 1 TB 磁盘，通常会挂载为 8 个数据目录，每个数据目录使用 1 块磁盘。HDFS 本身通过 block 副本处理磁盘和机器故障，所以很多部署会把 DataNode 磁盘当作 JBOD 使用，而不是把所有磁盘先做成一个大 RAID 盘。这样单盘坏了，影响的是那块盘上的 block replica，集群可以自动补副本。

> **NOTE**：block report 告诉 NameNode 自己保存了哪些 block，但这只包含“block 在哪些机器上”这类位置信息。如果 NameNode 的 FsImage/EditLog 等元数据彻底丢失，集群无法仅靠 block report 还原目录树、文件名、权限、文件到 block 的顺序映射和文件长度，也就无法自动恢复出原来的 HDFS 文件系统。
{:.note}

#### Block

Block 是 HDFS 的基本存储和复制单位。一个文件会被切成若干 block，最后一个 block 可以小于标准 block size。

HDFS 的 block size 通常远大于本地文件系统块大小。生产中常见值是 128 MB、256 MB 或更大。大 block 有几个好处：

- 降低 NameNode 元数据数量。
- 提高顺序读写效率。
- 让计算任务处理较大的连续数据片段。
- 减少寻址和调度开销。

代价也很明显：HDFS 不适合保存海量几 KB、几十 KB 的小文件。小文件不仅浪费计算调度效率，更会让 NameNode 元数据数量快速膨胀。

#### Replica 与复制因子

Replica 是 block 的副本。最常见的复制因子是 3，表示每个 block 保存 3 份。复制因子本质上是文件属性，可以通过默认配置影响新文件，也可以对已有文件或目录树里的文件批量修改目标副本数。

复制因子不是越高越好。副本越多，读取可用性和容错能力越强，但磁盘、网络和写入成本也越高。复制因子为 3 时，1 TB 原始数据大约需要 3 TB 存储空间。Hadoop 3.x 的 HDFS 还支持 Erasure Coding，用更低存储开销保存冷数据。

#### Rack Awareness

HDFS 不是只把副本随机撒到任意机器上。生产集群通常会配置机架拓扑，NameNode 会尽量让副本跨机架分布。

以复制因子 3 为例，常见策略可以理解为：

1. 如果写入客户端就在某个 DataNode 上，第一份副本尽量写本机。
2. 第二份副本放到另一个机架上的 DataNode。
3. 第三份副本放到第二份副本所在机架的另一台 DataNode。

这样做是在可靠性和写入成本之间折中：至少保留一份跨机架副本，以应对整机架或交换机故障；同时又没有把每一份副本都写到跨机架节点上，避免写入网络成本过高。

#### Client

HDFS Client 需要能够同时连接 NameNode 和 DataNode。它的工作方式是：

- 向 NameNode 发 RPC，获取或修改元数据。
- 根据 NameNode 返回的 block 位置信息，直接和 DataNode 传输数据。

换句话说，NameNode 在数据路径之外。读文件时，Client 问 NameNode “这个文件有哪些 block，副本在哪些 DataNode”；然后 Client 直接从合适的 DataNode 读。写文件时，Client 问 NameNode “这个 block 应该写到哪些 DataNode”；然后 Client 直接把数据写入 DataNode pipeline。

这种设计避免了 NameNode 成为数据传输瓶颈。

### HDFS 的工作原理

接下来，我们通过一个文件的生命周期来理解 HDFS 的工作原理。

![HDFS 读写路径](img/posts/hdfs-read-write-flow.svg)

#### 读流程：Client 如何读取一个文件

当客户端读取 HDFS 文件时，大致经历这些步骤：

1. Client 调用 `open(path)`，向 NameNode 请求文件元数据。
2. NameNode 检查路径、权限和文件状态，返回文件包含的 block 列表，以及每个 block 的副本位置。
3. Client 根据网络拓扑选择较近的 DataNode，通常优先读本机副本，其次同机架副本，再其次跨机架副本。
4. Client 直接连接 DataNode，按顺序读取 block 数据。
5. 读取过程中 Client 校验 checksum。如果发现某个副本损坏，会切换到其他副本，并向 NameNode 报告坏块。
6. 当前 block 读完后，继续读取下一个 block，直到文件结束。

这个过程里，NameNode 不转发数据。NameNode 只提供 block 位置信息，数据流直接从 DataNode 到 Client。

这也是为什么 HDFS 很适合顺序扫描大文件。一个计算任务拿到输入 split 后，可以尽量调度到持有对应 block 的节点上，在本机读取数据；如果本机没有，就尽量在同机架读取；最后才跨机架读取。

#### 写流程：Client 如何写入一个文件

HDFS 的写入比读取更复杂，因为它要同时处理 block 分配、副本复制、pipeline ack、lease 和故障恢复。

一次写入大致是这样：

1. Client 调用 `create(path)` 请求创建文件。
2. NameNode 检查路径是否存在、父目录是否存在、权限是否允许，并为这个文件建立元数据记录。
3. Client 开始写第一个 block 时，向 NameNode 请求 block 的目标 DataNode 列表。
4. NameNode 根据复制因子、机架拓扑、DataNode 负载和可用空间等信息选择一组 DataNode。
5. Client 与第一台 DataNode 建立连接，第一台再连接第二台，第二台再连接第三台，形成 pipeline。
6. Client 把数据切成 packet，发送到 pipeline 的第一台 DataNode。
7. 第一台 DataNode 写本地磁盘，同时把 packet 转发给第二台；第二台写本地并转发给第三台。
8. 当 pipeline 末端写入成功后，ack 反向返回，直到 Client 收到确认。
9. 当前 block 写满后，Client 再向 NameNode 请求下一个 block 的目标 DataNode，重复上面的过程。
10. Client 调用 `close()`，NameNode 记录文件最终长度，释放 lease，文件从 under-construction 状态变成已完成文件。实践中，上层系统通常还会结合 rename、`_SUCCESS` 或事务提交标记来决定何时让下游消费这批数据。

HDFS 的写入是 pipeline 复制，而不是 Client 分别向 3 台 DataNode 各写一遍。这样可以减少 Client 的出口带宽压力，也让副本链路更容易管理。

#### Lease：为什么 HDFS 通常是单写者模型

HDFS 的文件写入由 lease 保护。一个正在写的文件会有一个 lease holder，通常就是创建它的客户端。NameNode 通过 lease 知道谁有权继续写这个文件。

这体现了 HDFS 的基本假设：文件通常是一次写入，然后被多次读取。它不是为了多个客户端同时随机修改同一个文件而设计的。

现代 HDFS 支持 append，但 append 也不会让 HDFS 变成数据库文件系统。它适合追加日志式内容或补写文件尾部，不适合频繁在文件中间修改记录。很多上层系统会通过“写新文件 + 原子 rename”来提交结果，而不是原地修改旧文件。

例如 MapReduce 或 Spark 任务通常先写到临时目录：

```text
/tmp/job-123/_temporary/attempt-xxx/part-00000
```

任务成功后，再把输出 rename 到最终目录：

```text
/warehouse/orders/day=2025-05-27/part-00000
```

这种模式利用了 HDFS 的目录元数据操作，把“计算过程中的不完整结果”和“对外可见的最终结果”隔离开。

#### Checksum：如何发现坏数据

HDFS 会为 block 数据维护 checksum。Client 写入时，数据和 checksum 一起进入 DataNode；Client 读取时，会校验读到的数据。

如果读取某个副本时 checksum 不匹配，Client 会认为这个 replica 有问题，转读其他副本，并把坏副本报告给 NameNode。NameNode 后续可以安排删除坏副本，并从健康副本重新复制。

#### Heartbeat、Block Report 与副本恢复

DataNode 会周期性给 NameNode 发送 heartbeat。Heartbeat 让 NameNode 知道 DataNode 是否存活，也会携带容量、使用率、传输负载等状态。

DataNode 还会发送 block report，告诉 NameNode 自己保存了哪些 block。NameNode 结合所有 DataNode 的 block report，就能知道每个 block 当前有哪些 replica。

当某些 replica 不足时，NameNode 会把 block 标记为 under-replicated，并安排 DataNode 复制。例如，一个 block 的复制因子是 3，但某台 DataNode 故障后只剩 2 份，NameNode 会选择一个源 DataNode 和一个目标 DataNode，让它们完成复制，把副本数补回 3。

如果某个 block 的所有 replica 都丢了，那就是数据丢失。HDFS 能容忍节点故障，不等于能从所有副本丢失中恢复。

#### Safemode：NameNode 的保护状态

NameNode 启动时会进入 safemode。它先加载 FsImage 和 EditLog，恢复命名空间；随后等待 DataNode 上报 block report，确认足够多的 block 已经达到最小副本要求。

在 safemode 中，HDFS 通常不允许修改命名空间，也不会立即执行重新复制。因为 NameNode 刚启动时还不知道集群里到底有哪些 block replica，如果过早判断大量 block 缺副本，可能会误触发巨量复制。

当 block 上报达到阈值后，NameNode 离开 safemode，集群进入正常服务状态。生产中如果 NameNode 长时间卡在 safemode，通常要检查 DataNode 是否大量未启动、磁盘是否挂载异常、block 是否真的丢失。

#### FsImage、EditLog 与 Checkpoint

NameNode 元数据不能只放内存里。否则 NameNode 重启后，整个文件系统目录树和 block 映射都会丢失。

HDFS 用 FsImage 和 EditLog 持久化元数据：

```text
FsImage: 某个时间点的完整命名空间快照
EditLog: 快照之后的每一次元数据修改
```

如果 EditLog 无限增长，NameNode 重启时重放日志会越来越慢。因此 HDFS 需要 checkpoint：将旧 FsImage 和一段 EditLog 合并成新的 FsImage，再截断已合并的日志。

早期部署中常见 `SecondaryNameNode`，名字很容易误导。它不是 NameNode 的热备，不能在 NameNode 挂掉后自动接管服务。它主要负责周期性拉取 FsImage 和 EditLog，做 checkpoint，再把新的 FsImage 传回 NameNode。

在 HA 部署中，Standby NameNode 会持续读取共享 edits，并维护一份接近实时的命名空间状态；它也可以承担 checkpoint 工作。因此生产环境谈高可用时，不应该把 SecondaryNameNode 当成 HA。

#### 删除、Trash 与空间回收

删除 HDFS 文件时，NameNode 先修改命名空间。如果启用了 Trash，文件会先进入回收站目录；超过保留时间后再真正删除。如果没有 Trash，删除操作会让文件从命名空间消失，NameNode 后续通知 DataNode 删除对应 block。

空间回收不是“客户端删除命令返回的一瞬间所有磁盘空间都释放”。DataNode 删除 block、更新统计、NameNode 刷新状态都需要一点时间。生产排查空间问题时，需要同时检查 Trash、快照、under-construction 文件、DataNode 磁盘目录和 NameNode 报告。

#### Snapshot：为什么删了文件空间可能还在

HDFS 支持目录级 snapshot。Snapshot 会保留某个目录在某个时间点的视图。

如果一个文件被 snapshot 引用，即使你在当前目录视图里删除了它，底层 block 也不能马上释放，因为 snapshot 仍然需要它。这和很多存储系统的快照语义类似。

因此，当 HDFS 空间看起来“删不掉”时，除了 Trash，还要检查是否有 snapshot 保留了旧数据。

### 高可用与扩展

单 NameNode 是 HDFS 早期架构中最明显的风险。NameNode 挂掉后，已有 DataNode 上的数据还在，但客户端无法获取元数据，也无法正常读写文件。因此生产环境通常会使用 NameNode HA。

#### NameNode HA

HDFS HA 通常有两个 NameNode：

- Active NameNode：对外提供读写服务。
- Standby NameNode：持续同步元数据，准备接管。

两者共享同一份 edits。常见方案是 Quorum Journal Manager，也就是部署一组 JournalNode。Active NameNode 把 EditLog 写入 JournalNode quorum；Standby NameNode 持续从 JournalNode 读取 edits，重放到自己的内存状态。

DataNode 会同时向 Active 和 Standby 发送 block report 和 heartbeat。这样 Standby 不仅有 namespace edits，也知道 block 分布情况。发生故障切换后，Standby 才能较快成为新的 Active。

自动故障切换通常依赖 ZooKeeper 和 ZKFC。ZKFC 运行在 NameNode 机器上，监控本地 NameNode 健康状态，并通过 ZooKeeper 进行 Active 选举。切换时还需要 fencing，确保旧 Active 不会继续对外服务，避免 split-brain。

可以把 HA 简化理解为：

```text
Active NameNode
  -> write edits to JournalNodes

Standby NameNode
  -> read edits from JournalNodes
  -> receive block reports from DataNodes
  -> take over after failover

ZKFC + ZooKeeper
  -> decide who is Active
  -> fence unhealthy old Active
```

> **NOTE**：ZKFC 是 ZooKeeper Failover Controller，通常和每个 NameNode 部署在同一台机器上。它一边监控本机 NameNode 是否健康，一边通过 ZooKeeper 参与 Active 选举：谁拿到 ZooKeeper 中的 active lock，谁就可以成为 Active NameNode。发生故障切换时，ZKFC 还会执行 fencing，确保旧 Active 被隔离，避免两个 NameNode 同时对外写元数据。
{:.note}

> **NOTE**：fencing 可以理解为“隔离旧 Active”。当 Standby 被提升为新的 Active 时，系统必须确认旧 Active 不会继续响应客户端，也不能再写共享 edits；否则两个 NameNode 都以为自己是 Active，就会出现 split-brain。HA 领域常用 STONITH（Shoot The Other Node In The Head）描述这种强制隔离动作，工程上一般会强制终止或隔离旧 Active。在 HDFS 里，ZKFC 负责发起故障切换，并调用配置好的 fencing method 完成隔离，例如停止旧 NameNode 进程、执行隔离脚本，或者切断旧节点对共享资源的访问能力。
{:.note}

HA 解决的是 NameNode 可用性，不是无限扩展 NameNode 容量。两个 NameNode 仍然管理同一个 namespace，内存压力仍然存在。

#### Federation

当一个 NameNode 管理的文件和 block 太多时，只做 HA 还不够。因为 HA 是同一个 namespace 的主备，不能把元数据压力拆开。这时需要 Federation。

HDFS Federation 允许一个集群中有多个独立 NameNode，每个 NameNode 管理自己的 namespace volume 和 block pool。DataNode 可以同时注册到多个 NameNode，并在本地磁盘上保存多个 block pool 的数据。

例如：

```text
NameNode A -> /warehouse
NameNode B -> /logs
NameNode C -> /user
```

这样可以把命名空间和 block map 分摊到多个 NameNode 上，提升可扩展性，也能做业务隔离。代价是客户端和上层系统要知道路径属于哪个 namespace，或者通过 ViewFs、Router Based Federation 之类的方式提供统一访问入口。

#### Erasure Coding

传统 HDFS 通过多副本保证可靠性。复制因子 3 很简单，也很适合热数据，但存储成本高：1 PB 原始数据需要约 3 PB 物理空间。

Erasure Coding 用数据块和校验块来降低冗余成本。以常见 RS(6, 3) 为例，可以把数据切成 6 个 data units，再计算 3 个 parity units。只要丢失的 units 不超过可恢复范围，就能通过剩余数据重建。

它的好处是存储开销明显低于 3 副本；坏处是读写、修复和小范围随机读取更复杂，CPU 和网络开销更高。因此 Erasure Coding 更适合冷数据、归档数据、很少修改的大文件，不适合频繁写入和高并发访问的热数据。

生产里常见做法是：热数据先用 3 副本保存，等数据变冷后再迁移到 EC 策略目录。

### 逻辑部署

HDFS 的逻辑部署可以分成几层：客户端/网关层、元数据层、共享日志和故障切换层、存储和计算层。

![HDFS 逻辑部署](img/posts/hdfs-logical-deployment.svg)

#### 客户端和网关层

客户端可以是命令行、应用程序、Spark、Hive、Flink、MapReduce、HBase，也可以是专门的 gateway/edge node。

生产环境通常不会让所有用户直接登录 NameNode 或 DataNode。更常见的做法是提供 gateway 节点：

- 安装 Hadoop client 配置。
- 放置 `core-site.xml`、`hdfs-site.xml`、Kerberos 配置等。
- 供用户提交作业、执行 `hdfs dfs`、运行脚本。
- 避免业务脚本和临时工具污染 master 节点。

如果使用 Federation，客户端还可能通过 ViewFs 或 Router 访问多个 namespace，降低业务侧感知成本。

#### 元数据层

元数据层至少包括 NameNode。生产 HA 环境通常是两台 NameNode 机器：

- 一台 Active。
- 一台 Standby。

NameNode 机器的重点不是磁盘容量，而是内存、CPU、稳定网络和可靠本地存储。NameNode 的本地元数据目录要谨慎保护，通常会配置多个 `dfs.namenode.name.dir`，放在不同磁盘或可靠存储上。

NameNode 不应该和重 I/O 的 DataNode 混跑在一起。小集群或测试环境可以合并角色，但生产环境最好让 NameNode 独占或至少避免被计算任务、磁盘扫描、日志爆炸拖垮。

#### JournalNode 与 ZooKeeper

使用 QJM 的 HA 部署需要 JournalNode。生产中常见 3 个 JournalNode，分布在不同机器上。Active NameNode 写 edits 时需要写入多数 JournalNode，Standby 从 JournalNode 读取 edits。

JournalNode 自身保存的是元数据修改日志，不保存 HDFS 文件内容。它的磁盘可靠性和延迟会影响 NameNode 写元数据操作的稳定性。

自动故障切换还需要 ZooKeeper 和 ZKFC。ZooKeeper 通常也是 3 或 5 节点集群。ZKFC 负责监控本机 NameNode，并参与 Active 选举和故障切换。

在小规模部署里，JournalNode、ZooKeeper、ResourceManager 等服务可能和 master 节点混部；在更大的集群里，它们会拆到独立管理节点，减少互相影响。

#### DataNode 与计算层

DataNode 是 HDFS 的容量和吞吐来源。每台 DataNode 管理本机多块磁盘，保存 block replica，并对外提供读写。

经典 Hadoop 部署通常把 DataNode 和 YARN NodeManager 放在同一批 worker 机器上：

```text
worker node
  -> DataNode: 存 HDFS block
  -> NodeManager: 跑 MapReduce/Spark/Flink container
```

这样做是为了数据本地性。计算任务尽量运行在保存目标 block 的机器上，读取本地磁盘而不是跨网络拉数据。

不过，数据本地性不是绝对规则。Spark、Hive、Flink 的调度、资源队列、数据格式、文件大小、缓存和网络情况都会影响实际读取路径。现代集群里网络更快，数据本地性的重要性有所下降，但 HDFS 的基本设计仍然围绕“计算靠近数据”展开。

#### 机架与网络

HDFS 集群应该配置 rack awareness。没有机架拓扑时，NameNode 很难知道哪些节点共享同一个交换机或故障域，副本放置就只能退化为更粗粒度的分布策略。

一个合理的部署至少要考虑：

- 副本跨机架，避免单机架故障导致数据不可用。
- 写入 pipeline 不要无谓跨太多机架。
- 大规模重复制时避免把某个机架或交换机打满。
- 监控 DataNode 到 NameNode 的 heartbeat 延迟和网络丢包。

HDFS 的很多故障看起来像存储问题，本质上可能是网络问题：DataNode heartbeat 超时、写 pipeline ack 慢、跨机架读取延迟高、重复制长期追不上。

#### 小集群、标准生产集群和大集群

如果只是开发测试，一个 NameNode 加几台 DataNode 就能跑起来：

```text
NameNode
DataNode 1
DataNode 2
DataNode 3
```

这种结构简单，但 NameNode 是单点，不能当成生产高可用。

标准生产集群通常是：

```text
2 x NameNode         Active / Standby
3 x JournalNode      shared edits quorum
3 x ZooKeeper        automatic failover
2 x ResourceManager  if YARN is used
N x DataNode         storage capacity
N x NodeManager      compute containers, often co-located with DataNode
1+ gateway nodes     client access and job submission
```

更大规模时，会引入：

- Federation，把 namespace 拆给多个 NameNode。
- Router Based Federation 或 ViewFs，统一客户端入口。
- Erasure Coding，降低冷数据存储成本。
- 独立 master、management、gateway、worker 资源池。
- 更严格的机架、磁盘、网络和安全隔离。

### 常见坑

#### 坑一：把 HDFS 当普通文件服务器

HDFS 不适合大量小文件和低延迟随机访问。它的强项是大文件顺序吞吐。把用户头像、配置碎片、在线服务小 JSON 都放进 HDFS，会让 NameNode 元数据压力和计算任务调度成本一起上升。

小文件问题通常需要通过合并文件、SequenceFile、Avro、Parquet、ORC、HBase、对象存储或专门的元数据层来解决。

#### 坑二：只看磁盘使用率，不看 NameNode 内存

HDFS 容量没满，不代表 NameNode 安全。如果文件数、目录数、block 数增长太快，NameNode heap 会先成为瓶颈。

排查 HDFS 容量时要同时看：

- 总文件数。
- 总 block 数。
- 平均文件大小。
- NameNode heap 使用率和 GC。
- FsImage/EditLog checkpoint 情况。
- under-replicated blocks。

#### 坑三：误解 SecondaryNameNode

SecondaryNameNode 不是备用 NameNode。它不能在 NameNode 挂掉时自动接管。把它当 HA，是风险很高的误解。

真正的高可用应该使用 Active/Standby NameNode、共享 edits、ZKFC、ZooKeeper 和 fencing。

#### 坑四：忽视写入关闭语义

很多上层系统写 HDFS 时，会先写临时文件，再 rename 成最终文件。如果任务失败，临时目录里可能留下未完成文件。下游如果直接扫描临时目录或没有识别 `_temporary`、`_SUCCESS`、事务提交标记，就可能读到半成品。

数据湖表格式、Hive 分区加载、Spark output committer 本质上都在处理同一个问题：什么时候一批文件算提交成功，什么时候对下游可见。

#### 坑五：副本数等于可靠性

复制因子 3 只是一个目标副本数，不代表任何时间点所有 block 都有 3 个健康副本。DataNode 故障、磁盘坏道、网络分区、机架故障、重复制积压都会让部分 block 短时间 under-replicated。

真正的可靠性还依赖：

- 副本是否跨故障域。
- NameNode 是否 HA。
- JournalNode 和 ZooKeeper 是否健康。
- 是否有快照和备份策略。
- 是否监控 corrupt/missing/under-replicated blocks。
- 是否定期做恢复演练。

#### 坑六：把 Erasure Coding 用在热写入路径

EC 的存储成本更低，但代价并没有消失。它的编码、修复和读取复杂度更高。把高频写入、高频读取、低延迟要求的数据直接放进 EC 目录，可能会让性能和恢复复杂度都变差。

更稳妥的策略是按冷热分层：热数据使用副本，冷数据归档到 EC。

### 参考资料

- [Apache Hadoop 3.4.1: HDFS Architecture](https://hadoop.apache.org/docs/r3.4.1/hadoop-project-dist/hadoop-hdfs/HdfsDesign.html)
- [Apache Hadoop 3.4.1: HDFS High Availability With QJM](https://hadoop.apache.org/docs/r3.4.1/hadoop-project-dist/hadoop-hdfs/HDFSHighAvailabilityWithQJM.html)
- [Apache Hadoop 3.4.1: HDFS Federation](https://hadoop.apache.org/docs/r3.4.1/hadoop-project-dist/hadoop-hdfs/Federation.html)
- [Apache Hadoop 3.4.1: Router Based Federation](https://hadoop.apache.org/docs/r3.4.1/hadoop-project-dist/hadoop-hdfs-rbf/HDFSRouterFederation.html)
- [Apache Hadoop 3.4.1: HDFS Erasure Coding](https://hadoop.apache.org/docs/r3.4.1/hadoop-project-dist/hadoop-hdfs/HDFSErasureCoding.html)
- [Apache Hadoop 3.4.1: HDFS Commands Guide](https://hadoop.apache.org/docs/r3.4.1/hadoop-project-dist/hadoop-hdfs/HDFSCommands.html)
- [The Hadoop Distributed File System](https://storageconference.us/2010/Papers/MSST/Shvachko.pdf)
- [The Google File System](https://research.google/pubs/the-google-file-system/)
