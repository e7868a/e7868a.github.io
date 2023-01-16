---
title: 理解 Python 中的协程
category: 软件开发
---

 [asyncio](https://docs.python.org/zh-cn/3/library/asyncio.html) 是 Python 下开发 I/O 密集型应用的最佳选择，而使用 asyncio 又离不开[协程](https://docs.python.org/zh-cn/3/library/asyncio-task.html#coroutine)。

### 什么是协程

协程是一种可以中断运行，在某个时间点再恢复运行的程序组件。这个定义和协程的字面意思一点关系没有，刚接触时，理解起来是十分晦涩的。我们先看其英文 **coroutine** 会更好理解一些，“co-" 这个前缀有”一起，共同”的意思，比如 **co-author** 表示合著一本书的作者，**coexist** 表示共存。类似的我们可以把 coroutine 理解为共同，协作运行的程序组件。

如何理解这个**协作运行**呢？我们常用的函数不也是在协作运行吗？我们一般所说的函数，也就是 **subroutine**（子程序）也是一种程序组件。我们已经很熟悉函数的工作方式，函数总是有且只有一个入口，一旦从入口开始执行，便会一直执行到函数结束。现代计算机是以线程为单位来调度任务的，我们执行一个任务，通常先创建一个进程，每个进程会有一个主线程，主线程从 main 函数开始执行。我们也可以为进程创建新线程，每个线程都需要指定一个函数作为入口函数，线程启动后便会开始执行这个函数。一个线程开始执行某个函数后，便会一直执行到它结束 ，如果中间需要调用其它函数，也是在这个函数的Context 之上，再压新栈去执行其它函数。

协程与 subroutine 不同的是，协程在执行过程中可以暂停，把线程让出（yield）给其它代码去执行，然后在某个时间点再恢复执行，这种 yield 不是调用关系而是**切换**，线程从一个协程的 Context 切换到了另一个协程的 Context。在这种情况下，多个协程便可以在同一线程下并发执行。也就是说，协程的暂停后再恢复机制，是为了能够让出线程的使用权，而让出线程的使用权后，就可以在当前线程去执行其它协程，也就实现了<u>多个协程共同运行</u>。通常也会认为 subroutine 是 coroutine 的一个特例，subroutine 是在执行中不会让出 (yeild) 的 coroutine。

以 Python 中的 sleep 为例，我们让代码睡眠 5 秒钟后继续执行，我们在函数中调用 time.sleep(5) 时，当前函数停止执行了，当前线程也是停住的，不会执行其它代码。而在协程中调用 asyncio.sleep(5) 时，当前协程停止执行了，但是当前线程仍然会继续运行，去执行其它代码，5 秒钟后当前协程自动恢复执行。需要注意的是，我们在函数中调用的是 time.sleep(5)，而在协程中调用的是 asyncio.sleep(5)，asyncio.sleep 是协程版本的 sleep 函数。如果在协程中调用 time.sleep(5)，协程停住的5秒钟中，线程同样也是停住的，必须调用协程版本的 asyncio.sleep 才能实现协程的效果。

### 协程的优势

协程这种可以执行中让出线程的特性具有十分巨大的优势，特别是在I/O应用中。

绝大部分应用在运行中都离不开 I/O 操作，比如网络I/O，磁盘I/O等。Linux 提供了 5 种 I/O 模型，有阻塞式，非阻塞式，I/O 多路复用，信号驱动 I/O，异步 I/O 等，在此基础上，针对不同的应用场景又有多种不同的开发范式。我们以 Web 服务器为例，简单介绍两种常见的实现方法。

Socket 编程将网络通信的两个端点抽象为 两个 Socket。Socket 可以工作在阻塞模式或非阻塞模式下，阻塞模式的意思是 I/O 函数在调用时是阻塞的，例如 调用Socket 的 read 函数，在读到数据或者异常之前一直不会返回，函数不返回就意味着对应的线程是停住的。为了能支持多个 Socket 同时通信，必须为每个 Socket 创建一个线程。有些 Web 服务器会为每个客户端连接创建一个 Worker 线程，这并没有什么问题，这种模型特别适用于 HTTP 这种 Request/Response 的模式。唯一的问题是，线程会占用一定资源，线程之间频繁的切换会浪费 CPU 时间，线程越多用的内存越多（在内存很便宜的现在，这倒不是什么大问题），所以线程的数量是有限制的，一般的 Web 服务器 worker 线程数量在几百个左右已经很多了。这种方法也被称为**多线程的阻塞模式**，这种模式是最容易理解和实现的一种模式，但也是最有局限性的一种模式。

既然阻塞模式下的 read 会停住线程，那么非阻塞模式是不是会好一点儿呢？当 Socket 被创建为非阻塞模式时，在非阻塞模式的 Socket 上调用 read 函数，如果当前没有数据可以读取，read 函数并不会阻塞，而是返回 EWOULDBLOCK 错误，这个错误告诉我们现在没有新数据，可以过一段时间再重试，这样当前的线程就可以继续去执行其它代码，过段时间重新调用 read。这里其实有个更大的问题，Socket 什么时候有数据可读是不确定的，如果我们通过轮询去检查有没有新数据，这不仅浪费资源，还没办法在数据到达的第一时间去读取。我们需要一种机制，在 Socket 可读时能通知到我们。select 函数便是为此而来。select 函数可以告诉我们一组 Socket 中，哪些可以读，可以写，或者有异常发生。我们只要新建一个线程，不断地调用 select 就可以监视多个 Socket 的状态变化，这便是 I/O 多路复用模式。

多路复用模式相对于阻塞模式性能会更好（select 模型其实性能一般，linux 下性能更好的是 epoll 模型，运行原理大体一样），也更灵活，但是也更复杂。因为 **I/O Ready** 的消息需要一个机制才能通知给应用代码。我们一般称之为**事件驱动模式**（event-driven model)，常用的范式是 Reactor，将 I/O Ready 的消息，转换成事件，然后调用事件的 handle 函数，应用代码在 handle 函数中实现自己的逻辑。

对于应用代码的开发者来说，我们很显然更喜欢多线程的阻塞模式，因为 I/O 代码和应用代码是连贯在一起的，read 完以后就可以处理数据，处理完以后就可以 send，send 成功就可以放心地认为数据发送成功了。事件驱动模式下，I/O 代码和应用代码是分离的，假如我们在应用代码中调用 send 函数，这只是告诉 I/O 代码我们要发送这些数据，这些数据有没有发送成功？要等事件通知。大多数情况下，我们都需要使用多线程的事件驱动模式，哪些数据需要保障线程安全，哪些不需要，需要开发者对底层 I/O 代码有精确的了解，才实现出高性能的网络应用。

回过头来看协程的特点，如果用协程来解决这个问题就会非常舒服了，因为协程在执行中可以中断，我们在调用 read 时，把线程 yield 给其它协程就行，等到有数据可读时，原来的协程可以从 read 继续执行。在我们看来就像是调用了阻塞模式的 read，完全不需要考虑这背后事件是怎么工作的。由于这些协程都是在同一个线程中执行，我们也不需要考虑线程安全问题。

对于 Python 来说，协程更加有优势。由于 Global Interpreter Lock 的存在，Python 中的多线程并不能被称为真正的多线程，Global Interpreter Lock 限制一个进程同一时间只执行一个线程，所以即使在 Python 中使用了多线程，实际上同一时间只有一个线程在运行。使用协程后就会充分利用一个线程，而不需要多线程之间无谓的切换损耗。

### 协程的局限性

因为协程都在同一个线程上执行，如果某个协程在执行上花费了太多的 CPU 时间，就会导致所有协程的延迟。我们在上文提到过，协程中不能调用 time.sleep 去睡眠，因为它会导致整个线程睡眠，这也会导致其它所有协程都被延迟。所以，协程更适用于 I/O bound 的场景，而不适用于 CPU bound 的场景，使用协程时需要特别注意，大量消耗 CPU 的任务，应该放在协程外，以异步任务的形式执行。

协程并不能提高性能，除了你有大量线程（成千上万个？）运行的场景。协程实现异步 I/O 仍然是基于操作系统提供的 I/O 模型，相对于非协程的实现并不会有性能上的提升。但是协程确实让代码更简洁了，让开发更容易了，这会大大减少开发成本。

### 在 Python 中使用协程

#### Generator

Python 中首先支持的是 Generator，Generator 是一种可以当成 iterator 来使用的函数。

```python
def firstn(n):
    num = 0
    while num < n:
        yield num
        num += 1

for num in firstn(10):
    print(num)
```

上面的代码中，我们定义了名为 firstn 的 generator。generator 可以通过 for each 或者 next() 函数读取。如果我们如果查看 firstn(10) 的值，会发现它返回的是一个 generator object。

```
>>> firstn(10)
<generator object firstn at 0x7fe40d412cd0>

>>> obj = firstn(10)
>>> obj
<generator object firstn at 0x7fe40d412c50>
>>> next(obj)
0
>>> next(obj)
1
```

起作用的是 `yield` 关键字，yield 关键字，将这个函数变成了 generator。

#### Python Coroutine

Python 中的 coroutine 与 generator, 略有不同，可以认为是一种特殊的 generator。

```python
def grep_word(match):
    print("Print sentence match word: {}".format(match))
    while True:
        sentence = (yield)
        if match in sentence:
            print(sentence)

corou = grep_word("Hello")

# grep_word 会执行到 sentence = (yield) 处暂停
next(corou)

corou.send("First Sentence")
corou.send("Hello world")
```

与 generator 不同的是，coroutine 中的 **yield** 没有参数。我们查看 corou 的值，会发现它也是个 generator object。调用 `next()` 时，grep_word 会开始执行，执行到 `sentence = (yield) ` 时暂停。调用 `corou.send()` 时，把 send 的值 传递给 sentence ，并继续执行。

```
>>> corou = grep_word("Hello")
>>> corou
<generator object grep_word at 0x7f95b7ce9cd0>
>>> next(corou)
Print sentence match word: Hello
>>> corou.send("First Sentence")
>>> corou.send("Hello world")
Hello world
```

可以看出，generator 是生成数据的，而 coroutine 是消费数据的。

#### 实现 Echo Server

有了 Coroutine 作为基础，我们已经可以使用 coroutine 来实现网络服务，内容较多，这里不做详细的说明，有兴趣的同学可以参考 Python 大神 [David Beazley](https://www.dabeaz.com/) 的文章 [A Curious Course on Coroutines and Concurrency](http://www.dabeaz.com/coroutines/index.html)。这篇文章中有 coroutine 的详细介绍，以及 coroutine 很多很奇妙的应用场景。

下面这段代码是从原文摘录的，很容易理解。重点是 server 和 handle_client 这两个 coroutine, 以及 Scheduler 实现的 event loop。

```python
import select
import socket
from queue import Queue


class Task:
    '''所有任务的基类'''
    taskid = 0

    def __init__(self, target) -> None:
        Task.taskid += 1
        self.tid = Task.taskid
        self.target = target
        self.sendval = None

    def run(self):
        return self.target.send(self.sendval)


class SystemCall:
    '''如果 Task.run 返回了 SystemCall, 
       Scheduler 会调用 SystemCall.handle 来执行需要的操作'''

    def handle(self):
        pass


class Scheduler:
    '''运行 event loop, 调度 Task 运行'''

    def __init__(self) -> None:
        self.ready = Queue()
        self.taskmap = {}
        self.read_waiting = {}
        self.write_waiting = {}

    def wait_for_read(self, task, fd):
        self.read_waiting[fd] = task

    def wait_for_write(self, task, fd):
        self.write_waiting[fd] = task

    def new(self, target):
        newtask = Task(target)
        self.taskmap[newtask.tid] = newtask
        self.schedule(newtask)
        return newtask.tid

    def iotask(self):
        while True:
            if self.ready.empty():
                self.iopoll(None)
            else:
                self.iopoll(0)
            yield

    def iopoll(self, timeout):
        if self.read_waiting or self.write_waiting:
            r, w, e = select.select(
                self.read_waiting, self.write_waiting, [], timeout)
            for fd in r:
                self.schedule(self.read_waiting.pop(fd))
            for fd in w:
                self.schedule(self.write_waiting.pop(fd))

    def schedule(self, task):
        self.ready.put(task)

    def exit(self, task):
        print("Task %d terminated" % task.tid)
        del self.taskmap[task.tid]

    def mainloop(self):
        '''主循环，调度运行所有的 Task'''
        self.new(self.iotask())
        while self.taskmap:
            task = self.ready.get()
            try:
                result = task.run()
                if isinstance(result, SystemCall):
                    result.task = task
                    result.sched = self
                    result.handle()
                    continue
            except StopIteration:
                self.exit(task)
                continue
            self.schedule(task)


class ReadWait(SystemCall):
    def __init__(self, f) -> None:
        self.f = f

    def handle(self):
        fd = self.f.fileno()
        self.sched.wait_for_read(self.task, fd)


class WriteWait(SystemCall):
    def __init__(self, f) -> None:
        self.f = f

    def handle(self):
        fd = self.f.fileno()
        self.sched.wait_for_write(self.task, fd)


class NewTask(SystemCall):
    '''创建一个新的 Task'''

    def __init__(self, target) -> None:
        self.target = target

    def handle(self):
        tid = self.sched.new(self.target)
        self.task.sendval = tid
        # 触发自己的 Task 继续执行
        self.sched.schedule(self.task)


def handle_client(client, addr):
    print(f"Connection from {addr}")
    while True:
        # 等待可读
        yield ReadWait(client)
        data = client.recv(65535)
        if not data:
            break
        # 等待可写
        yield WriteWait(client)
        client.send(data)

    client.close()
    print(f"Client closed {addr}")


def server(port):
    print(f'Server starting port: {port}')
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("", port))
    sock.listen(5)
    while True:
        # 等待新的连接到达
        yield ReadWait(sock)
        client, addr = sock.accept()
        # 使用 handle_client 创建一个新的 Task, 处理客户端的请求
        yield NewTask(handle_client(client, addr))


sched = Scheduler()
sched.new(server(9998))
sched.mainloop()
```

#### asyncio 库

从 Echo Server 这个例子可以看出，如果要使用 coroutine ，必须要实现一个 event loop，也就是例子中的 Scheduler.mainloop，因为必须调用 coroutine 的 send 函数，coroutine 才会持续执行，我们需要 event loop 来完成这个工作，并且在 coroutine 之间进行调度。这是一个不小的轮子。Python 3.4 开始提供了专门用于运行和管理 coroutine 的 asyncio 库，连同 async 和 await 关键字，大大方便了使用 Coroutine 开发应用程序。

```python
import asyncio

async def main():
    print('Hello ...')
    await asyncio.sleep(1)
    print('... World!')

asyncio.run(main())
```

上面的例子中，`async def` 关键字将 main 函数定义为 coroutine。 如果我们查看 main() 的返回值，会发现这是一个 `coroutine object`。`asyncio.run() ` 会创建一个 event loop，并在 event loop 中执行所有的 coroutine, 直到全部结束。

```
>>> obj = main()
>>> obj
<coroutine object main at 0x7f24bf44cf80>
```

使用 asyncio 来实现 Echo Server 变得非常简单。

```python
import asyncio


async def handle_tcp_echo(reader, writer):
    address = writer.get_extra_info('peername')
    print(f'connection accept from {address}')

    while True:
        data = await reader.read(65535)
        if not data:
            print(f'connection closed {address}')
            writer.close()
            return

        writer.write(data)
        await writer.drain()


async def run_server():
    server = await asyncio.start_server(handle_tcp_echo, "", 9998)
    async with server:
        await server.serve_forever()

asyncio.run(run_server())
```

我们实现了 `run_server`, `handle_tcp_echo` 两个 coroutine。除了几个 async 和 await 关键字，和阻塞模式的写法基本一样。







