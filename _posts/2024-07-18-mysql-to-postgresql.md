---
title: 从 MySQL 到 PostgreSQL
category: 系统运维
---

过去很长一段时间，MySQL 几乎就是互联网业务的默认数据库。它好上手，生态成熟，托管服务也多；主键查询、简单事务、读写分离、分库分表这些套路，大家都熟。

但这几年情况变了。越来越多的系统和团队，开始把 PostgreSQL 当成默认选择。这不是说 MySQL 不能用了，也不是 PostgreSQL 一定更快，而是大家对数据库的要求变了。

### 为什么 PostgreSQL 越来越受欢迎

Stack Overflow Developer Survey 的数据库调查中，PostgreSQL 近几年已经排在 MySQL 前面。它不再是小众替代品，而是很多人的首选关系数据库。

#### 第一，PostgreSQL 更像一个“数据平台”

MySQL 给人的第一印象，经常是一个稳定、高效、简单的 OLTP 数据库。它适合很多典型 Web 应用。

PostgreSQL 的定位更宽。它当然也是关系型数据库，但扩展能力更强：关系模型、复杂 SQL、JSONB、全文检索、地理信息、数组、范围类型（range type）、扩展机制和多种索引方法，都在同一个系统里。

这对很多团队很有吸引力。真实业务并不总是干净地分成“关系数据”“文档数据”“搜索数据”“地理数据”“向量数据”。订单、用户、商品、权限、审计、配置这些系统里，往往同时有结构化字段、半结构化字段、复杂筛选、聚合报表和扩展查询需求。

如果数据库只能承担简单 CRUD，很多逻辑就会被迫转移到应用层、搜索引擎、缓存或额外数据系统里。系统早期这样做没问题；但随着数据链路增多，一致性、同步、回补和排障成本都会上升。

`jsonb` 就是一个典型例子。它不是简单把 JSON 字符串塞进列里，而是提供了二进制存储、操作符、函数和索引能力。业务可以把稳定字段放在普通列里，把变化较快、结构不完全固定的字段放在 `jsonb` 里，同时仍然保留事务、JOIN、约束和备份恢复这套关系数据库能力。

过去一谈半结构化数据就想到文档数据库，一谈搜索就想到搜索引擎，一谈地理信息就想到专门的 GIS 系统。PostgreSQL 把这些能力收进了同一个生态里：PostGIS 让它成为事实上的开源地理数据库；`pg_trgm` 可以做相似度和模糊匹配；GIN/GiST 等索引方法支持数组、全文、JSONB 等结构；近几年 `pgvector` 又让很多团队可以先在 PostgreSQL 里处理一部分向量检索需求。

当然，这不表示 PostgreSQL 可以替代所有专业系统。高规模搜索仍然可能需要 Elasticsearch，高规模向量检索仍然可能需要专门向量数据库，大规模分析仍然可能需要 OLAP 系统。但 PostgreSQL 提供了一个更大的起步空间：让很多原本需要拆出去的能力，可以先留在关系数据库内部解决，在业务还没复杂到必须拆分系统之前，少引入几个额外组件。

#### 第二，PostgreSQL 的 SQL 和类型系统更强

PostgreSQL 更重视 SQL 标准、类型系统和语义一致性。它的窗口函数、CTE、丰富聚合、`RETURNING`、`DISTINCT ON`、`LATERAL` 连接、数组和 JSONB 操作符，让很多查询可以直接在数据库里表达清楚。

这对业务系统很重要。很多应用代码里的复杂逻辑，本质上是在做数据库擅长的事：过滤、分组、聚合、排序、去重、关联、约束。如果数据库表达力不够，开发者就会把这些逻辑搬到应用层，用代码拼装、循环和二次过滤完成。短期能跑，长期很容易变成难以验证的数据逻辑。

类型系统也是类似问题。PostgreSQL 有真正的 `boolean`，有 `uuid`、数组、range、`jsonb`、`inet` 等类型，也可以通过扩展获得更多能力。类型不是语法装饰，它是在告诉数据库：这个字段到底代表什么，哪些值合法，哪些索引和函数可以用。

MySQL 用户有时会觉得 PostgreSQL 更严格。比如不允许依赖宽松的 `GROUP BY` 行为，类型不匹配不轻易隐式转换，非法日期不能混过去。对一次性脚本来说，这可能麻烦；对长期维护的系统来说，严格往往是好事，因为错误越早暴露，越不容易沉淀成历史数据债务。

#### 第三，PostgreSQL 的许可证更友好

PostgreSQL 用的是很宽松的开源许可证（类似 BSD），修改、分发、闭源集成、做托管服务都比较自由，只要保留版权和许可声明。对商业公司、云厂商和数据库创业公司来说，这很重要。它们可以围绕 PostgreSQL 做托管服务、兼容数据库、扩展插件、开发工具和迁移服务，不必担心许可证踩坑。

MySQL 这边的故事就不太一样。MySQL 从 MySQL AB 时期就一直走「GPL + 商业授权」的路子：你可以免费用，但如果要把 MySQL 嵌进闭源产品里销售，或者想规避 GPL 义务做商业分发，就需要另外向版权方购买商业许可证。商业模式本身没问题，但 2008 年 Sun 收购 MySQL AB、2010 年 Oracle 又接手 Sun 之后，问题来了：版权方从一家纯做开源数据库的瑞典公司，变成了 MySQL 主要竞争对手 Oracle。

2009 年 Oracle 宣布要收购 Sun 后，MySQL 的原作者 Monty Widenius 推动了 MariaDB 这个 fork，理由是担心 Oracle 不会真心维护开源版；他还发起过「Save MySQL」请愿，要求欧盟否决这次收购。欧盟确实做了长时间反垄断审查，一度考虑要求 Oracle 剥离 MySQL；Oracle 最终做出一系列承诺（比如至少到 2015 年继续维持双授权），欧盟才在 2010 年 1 月 21 日无条件放行。这件事之后，业界对 MySQL 的许可证会不会变、商业条款会不会收紧，就一直比较敏感。

### MySQL 用户需要重新理解 PostgreSQL

越来越多的人选择 PostgreSQL，但是从 MySQL 到 PostgreSQL，差异不小。很多 MySQL 里的经验不能原样平移，尤其是表组织、MVCC、隔离级别和运维方式。

#### 表组织：InnoDB 聚簇索引 vs PostgreSQL heap

使用 MySQL 时，一般默认使用 InnoDB。InnoDB 表按聚簇索引组织，通常主键就是聚簇索引。整行数据存放在主键 B+Tree 的叶子节点里，二级索引保存的是对应行的主键值。

这个设计有几个直接后果：

- 主键不只是逻辑约束，也影响物理组织。
- 主键越长，二级索引越容易变大，因为二级索引里要保存主键值。
- 二级索引命中后，很多时候还要通过主键回到聚簇索引取整行。
- 按主键范围访问通常很自然，因为数据本身按主键组织。

PostgreSQL 的普通表不是这样。PostgreSQL 表数据存放在 heap 中，索引和表数据分离。主键是唯一索引加约束，它并不决定表的物理组织。索引项指向 heap 中 tuple 的位置（TID）。

这意味着很多 MySQL 索引经验要重新理解。

例如，在 InnoDB 中，短主键的重要性非常高，因为它会影响所有二级索引大小（开发者普遍使用自增整数作为主键）。在 PostgreSQL 中，主键仍然应该稳定、简洁，但它不会以同样方式嵌进每个二级索引。又如，MySQL 里覆盖索引常被用来避免回表；PostgreSQL 也支持 index-only scan 和 `INCLUDE` column，但是否真的能只读索引，还取决于 visibility map 等可见性信息。

#### MVCC：undo/purge vs VACUUM

MySQL InnoDB 和 PostgreSQL 都使用 MVCC，也就是多版本并发控制。更新一行时，数据库要让旧事务继续看到旧版本，同时让新事务看到新版本。但两者实现方式完全不同。

InnoDB 依赖 undo 记录保存旧版本，后台 purge 清理不再需要的版本。PostgreSQL 在更新时，不会直接覆盖原记录，而是在磁盘上写入一条新的 tuple，并将旧 tuple 标记为过期。之后再通过 VACUUM 或 autovacuum 清理。

在 PostgreSQL 中，VACUUM 不是“偶尔清理一下磁盘”的工具，而是 MVCC 正常工作的一部分。高频 `UPDATE`/`DELETE` 的表如果 autovacuum 跟不上，就会产生 bloat：表和索引占用远大于真实有效数据，查询成本和维护成本都会上升。

所以 PostgreSQL 运维必须关注 dead tuple、autovacuum、表膨胀、事务长度等统计信息。它们不是高级 DBA 才需要看的指标，而是 PostgreSQL 日常健康的一部分。

#### 事务和锁：PostgreSQL 更规范

对于开发者来说，在 `READ COMMITTED` 级别上做并发控制时，MySQL InnoDB 和 PostgreSQL 二者基本类似。常见两种套路：悲观锁，用 `SELECT ... FOR UPDATE` 先锁行再 `UPDATE`；乐观锁，给记录加一个 `version` 字段，写 `UPDATE ... WHERE id = ? AND version = ?`，靠影响行数判断冲突。两种写法在两边都能跑，行为接近。

但把隔离级别提到 `REPEATABLE READ` 之后，两者差异就拉开了。

MySQL InnoDB 的 RR 有一个特别的设计：普通 `SELECT` 是**快照读**，整个事务里看到的是同一份快照；而 `UPDATE`、`DELETE`、`SELECT ... FOR UPDATE` 这类是**当前读**，每次都直接取最新已提交版本。

这条差异落到乐观锁场景里会非常诡异。假设两条事务 A、B 几乎同时开始，都读到记录 `version = 12`。A 先 `UPDATE ... SET version = 13 WHERE id = ? AND version = 12` 并提交。B 接着执行同样的 `UPDATE`：因为 `UPDATE` 走当前读，会读到被 A 改过的 `version = 13`，`WHERE` 不匹配，`row_affected = 0`。这个表面结果其实是对的，应用据此重试即可。

诡异点在于：B 这时再做一次普通 `SELECT`，看到的依然是 `version = 12`。一边 `UPDATE` 提示“没更新到任何行”，一边 `SELECT` 显示“版本还是 12”。如果不理解 MySQL 的快照读 / 当前读分裂，这就会是一个非常隐蔽的问题。换句话说，MySQL 的乐观锁机制本身是工作的，但在 RR 事务里，你只能相信 `row_affected`，不能再拿普通 `SELECT` 去复核。

PostgreSQL 的 RR 就直白得多。同样两条事务并发改一行：B 在 `UPDATE` 时一旦发现这行已经被别的事务改过并提交，当前语句会报 `ERROR: could not serialize access due to concurrent update`（SQLSTATE `40001`），事务进入失败状态，必须回滚并重试整条事务。

也就是说，如果你决定把这类写冲突交给 PostgreSQL 的 RR 或 `SERIALIZABLE` 处理，应用层要做的是捕获 `40001` 并重试事务，而不是在同一条事务里继续查询、修补状态。冲突由数据库显式暴露出来，不再靠应用侧记版本号自己拼。如果再把隔离级别开到 `SERIALIZABLE`，连 write skew 这类更隐蔽的冲突，PostgreSQL 也能识别并让其中一方重试。

#### 运维差异：连接、统计信息和 autovacuum

MySQL 用户切到 PostgreSQL 后，在运维上也有不小的差异。

第一是连接数。与 MySQL 常见的线程模型不同，PostgreSQL 是多进程架构，每个客户端连接对应一个服务端进程，所以连接成本相对更高，通常不适合把最大连接数开得很大。高并发场景要认真使用连接池，必要时使用 PgBouncer 这类连接池组件。连接数不是越多越好，过多连接会增加内存和调度成本。

第二是统计信息。PostgreSQL 查询优化器非常依赖统计信息。大批量导入、批量更新、数据分布发生变化后，如果统计信息不准，优化器可能选择很差的执行计划。必须注意 `ANALYZE` 和 autovacuum/analyze 的配置。

第三是 bloat。因为 PostgreSQL 的 MVCC 旧版本会留在 heap 中，更新和删除多的表需要持续清理。autovacuum 配置不合适、长事务阻塞、批处理方式粗暴，都会让 bloat 累积。

第四是复制和 WAL。MySQL 用户熟悉 binlog、主从延迟和复制位点；PostgreSQL 用户要理解 WAL、replication slot、checkpoint、archive、hot standby、logical replication 等概念。尤其是 replication slot，如果下游长期不消费，可能导致 WAL 持续堆积，甚至把 `pg_wal` 所在磁盘打满。

### MySQL 仍然有它的位置

我们说 PostgreSQL 变流行，不等于说 MySQL 不值得用。MySQL 仍然非常适合大量业务，尤其是模型简单、访问路径清晰、团队经验充分的 OLTP 系统。

只是当业务需要更强的 SQL 表达、更严格的语义、更丰富的类型系统和更开放的扩展生态时，PostgreSQL 确实给了团队一个更有余量的默认选项。真正重要的不是站队，而是理解两套数据库的差异：知道哪些经验可以复用，哪些地方必须重新学习。
