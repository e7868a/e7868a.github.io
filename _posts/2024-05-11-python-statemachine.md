---
title: 在 Python 中使用 StateMachine
category: 软件开发
---

在软件开发过程中，大量的工作集中于管理和处理事物状态。通常，一个事物会因为某个事件从一个状态向另一个状态转变。例如，在游戏中，怪物可能会因为听到玩家的声音而进入警觉状态，然后在看到玩家时发动攻击。在交战过程中，它根据玩家的位置和状态使用不同的技能。在业务系统中，订单可能存在诸如新建、待付款、已发货、已完成等各种业务状态，而各种业务操作则推动订单状态的持续变化。在涉及复杂状态场景的情况下，如果不能有效地设计模型，就可能产生大量重复代码，并可能导致Bug。为了解决这类问题，我们经常采用状态机来实现相应场景的建模。

### 什么是有限状态机 （finite-state machine)

所谓的状态机，通常指的是**有限状态机**（`finite-state machine`）。有限状态机是一种数据模型，可以帮助我们达成以下目标：

  * 首先，它预定义了有限数量的状态，对应我们需要管理的所有事物状态。
  * 其次，无论何时，它都处于某个特定状态中。状态机确保我们设定了正确的状态迁移规则，并保证只进行有效的状态迁移，使我们不必担心出现状态不一致的错误。
  * 最后，状态机提供了事件接口，我们只需调用相应的事件接口，状态机内部就会帮助我们完成正确的状态迁移。这样我们只需要在适当的时刻执行自己的业务代码，极大地简化了对事物状态的管理。

在本文中，我们将介绍在 Python 中使用 [python-statemachine](https://python-statemachine.readthedocs.io/en/latest/readme.html) 这个库，以能够使用状态机来简化我们的开发工作。我们可以用 pip 安装 `python-statemachine`

```bash
pip install python-statemachine
```

### 如何定义状态机

首先，我们需要理解的一个关键概念是 **State**。在状态机中，每个State代表了某一特定状态，而一个状态机则会包含多个这样的State。状态机能够在这些State之间进行切换。重要的是，每个状态机应当具有唯一且明确的起始状态（init-state）。我们还可以为状态机设置一个结束状态（final-state）。一旦状态机进入终止状态，它就无法再切换至其他状态。然而，值得注意的是，并非所有的状态机都设置有终止状态。

在接下来的示例中，我们将构建一个用于异步任务管理的状态机。该状态机从上游系统接收任务，执行它，并在任务完成后将结果反馈给上游系统。我们的任务具备以下几种状态：

  * created: 这是新建任务的初始状态
  * running: 在此状态下，任务正在进行中
  * finished: 此状态表示任务已结束运行
  * reported: 表示任务结果已经上报给上游系统，这是终止状态

在 `python-statemachine` 中，状态机的定义如下如示：

```python
from statemachine import StateMachine, State

class TaskMachine(StateMachine):

    created = State("Created", initial=True)
    running = State("Running")
    finished = State("Fnished")
    reported = State("Reported", final=True)
```

接下来，我们需要告诉状态机如何在不同状态之间进行迁移。在状态机中，**Transition** 代表了从一个状态向另一个状态的迁移过程，这个过程是由 **Event** 触发的。

```python
class TaskMachine(StateMachine):

    created = State("Created", initial=True)
    running = State("Running")
    finished = State("Fnished")
    reported = State("Reported", final=True)

    start = created.to(running)
    finish = running.to(finished)
    report = finished.to(reported)
```

在此，我们定义了三个事件（Event）：

  * start —— 启动任务，使状态机从created状态转变为running状态
  * finish —— 表示任务执行结束，状态机将从running状态变为finished状态
  * report —— 我们通知上游系统任务执行结果，状态机从finished状态变为reported状态

值得一提的是，`python-statemachine` 提供了一个非常便捷的功能，可以帮助我们将状态机的当前状态绘制成图形表示：

```python
    task_control = TaskMachine() 
    task_control._graph().write_png("state-machine.png")
```

![State Machine](img/posts/state-machine-01.png)

需要注意的一点是，在使用状态机时，我们不能直接修改状态机的当前状态。相反，我们需要通过发送事件来更新状态机的状态。`python-statemachine` 提供了两种发送事件的方式。

```python
    task_control = TaskMachine()  # 定义状态机对象

    print(task_control.current_status) # 状态机的当前状态为 Created

    task_control.start()          # 让状态机从 created 变为 running
    task_control.send('start')    # 使用 send 方法和上面直接调用 start 方法是等价的。

    print(task_control.current_state)    # 当前状态为 Running
```

`python-statemachine` 会确保状态机按设定的状态迁移规则运行，如果当前状态是 `created`，而我们发送了 `finish` 事件，状态机会报错。

### 如何与状态机交互

至此，我们已经定义了状态机，并且可以通过发送事件来迁移状态机的状态。接下来，我们要实现的是将状态机与我们的业务代码有效地结合使用。这其实也是我们使用状态机的主要目的：我们需要在恰当的时刻执行适当的代码，让状态机能够影响和控制外部的代码。状态机会在某些特定时刻（例如，在进入或离开某个状态时）触发执行外部代码，这被称为 **Actions**。

通常情况下，Actions是通过回调（callback）方式来实现的，`python-statemachine` 支持以下几种 Actions：

  * before_transition() 开始 transition 之前
  * on_exit_state() 离开一个状态时
  * on_transition() 在 transition 中
  * on_enter_state() 进入一个状态时
  * after_transition() 在一个 transition 之后

```python
class TaskMachine(StateMachine):

    created = State("Created", initial=True)
    running = State("Running")
    finished = State("Fnished")
    reported = State("Reported", final=True)

    start = created.to(running)
    finish = running.to(finished)
    report = finished.to(reported)

    def before_transition(self, event, state):
        print(f"Before '{event}', on the '{state.id}' state.")
        return "before_transition_return"

    def on_transition(self, event, state):
        print(f"On '{event}', on the '{state.id}' state.")
        return "on_transition_return"

    def on_exit_state(self, event, state):
        print(f"Exiting '{state.id}' state from '{event}' event.")

    def on_enter_state(self, event, state):
        print(f"Entering '{state.id}' state from '{event}' event.")

    def after_transition(self, event, state):
        print(f"After '{event}', on the '{state.id}' state.")
```

上述的 Actions 会在所有 transition 和 state 变化时被调用，通常我们只接收自己感兴趣的 Actions. 对于 Transition, `python-statemachine` 支持 3 种 Actions:

  * before_{transition}  迁移之前
  * on_{transition}      迁移中
  * after_{transition}   迁移之后

对于 State, `python-statemachine` 支持两种 Actions:
  
  * on_enter_{state} 进入状态时
  * on_exit_{statue} 离开状态时

在接下来的代码中，我们将使我们的状态机能够启动并运行。

```python
class TaskMachine(StateMachine):

    created = State("Created", initial=True)
    running = State("Running")
    finished = State("Fnished")
    reported = State("Reported", final=True)

    start = created.to(running)
    finish = running.to(finished)
    report = finished.to(reported)

    def on_start(self):
        """启动任务，在任务结束后通知状态机任务已结束"""
        print("Task Started")
        self.finish()

    def on_finish(self):
        """任务已结束，通知状态机上报任务状态"""
        print("Task finished")
        self.report()

    def on_exit_running(self):
        print("Leaving running state")

    def on_report(self):
        """上报任务状态，结束后，状态机的状态自动变为 reorted"""
        print(f"Reprot task status")

    def on_enter_reported(self):
        print("Entering reported state")
```

我们只需要创建状态机，并发送 start 事件，启动状态机。

```python
>>> task_control = TaskMachine()
>>> task_control.start()

Task Started
Leaving running state
Task finished
Reprot task status
Entering reported state
```
### 有条件的状态迁移

上述的示例可能过于简单，实际上状态机能够处理的情况要复杂得多。在现实世界中，我们往往需要根据一些额外条件来判断状态机是否可以从一个状态迁移到另一个状态，或者应当从一个状态迁移到哪个状态。为了让上述示例更接近实际应用，我们可以增加一个重试机制。例如，我们的任务可能会因各种异常而失败，这时，我们允许任务有3次重试机会。

如果任务失败，我们需检查执行状态和重试次数。若重试次数未超过3次，那么我们将让任务重新运行。这种基于条件的状态迁移功能被称为 **Conditional Transition**。

```python
class TaskMachine(StateMachine):

    created = State("Created", initial=True)
    running = State("Running")
    finished = State("Fnished")
    reported = State("Reported", final=True)

    start = created.to(running)
    finish = running.to(finished, unless="should_retry") | running.to(
        created, cond="should_retry"
    )
    report = finished.to(reported)

    MAX_RETRY = 3

    def __init__(self):
        super().__init__()
        self.retried = 0
        self.task_status = None

    def should_retry(self, task_status):
        if not task_status and self.retried < self.MAX_RETRY:
            return True
        else:
            return False

    def on_start(self):
        print("Task Started")
        task_status = True if random.randint(1, 10) > 6 else False
        self.finish(task_status=task_status)

    def on_finish(self, task_status):
        print(f"Task finished with status: {task_status}")
        self.task_status = task_status

    def after_finish(self):
        if self.current_state == self.created:
            self.retried += 1
            print(f"We will retry the task, retrying: {self.retried}")
            self.start()
        else:
            assert self.current_state == self.finished
            self.report()

    def on_report(self):
        print(f"Reprot task status with status: {self.task_status}")
```

在发送 `finish` 事件时，我们传入了 `task_status` 参数以表示任务执行的成功与否。同时，我们对 `finish` 的状态转换进行了修改。如果任务仍有重试机会，那么状态将从 `running` 变为 `created`；否则，状态将从 `running` 变为 `finished` 。在 `after-finish`中，我们判断了 `finish` 后的状态：如果是 `created` 状态，说明我们需要重新尝试任务；如果是 `finished` 状态，则发送 `report` 事件，通知状态机上报任务状态。

这是我们的状态机现在的样子。

![State Machine](img/posts/state-machine-02.png)

我们使用 random 随机数来模拟任务执行失败的情况，也就是在一定概率下使 task_status 为 False。再次运行状态机时，你会发现它已经可以进行重试操作了。

```python
>>> task_control = TaskMachine()
>>> task_control.start()

Task Started
Task finished with status: False
We will retry the task, retrying: 1
Task Started
Task finished with status: False
We will retry the task, retrying: 2
Task Started
Task finished with status: False
We will retry the task, retrying: 3
Task Started
Task finished with status: True
Reprot task status with status: True
```

### Processing model

如果我们仔细观察上述代码，会发现，在 `on_start` 中，我们调用了 `self.finish()` 方法。也就是说，在执行 start transition 时，我们启动了finish transition。

```
    def on_start(self):
        print("Task Started")
        task_status = True if random.randint(1, 10) > 6 else False
        self.finish(task_status=task_status)
```

有些人可能会担心，在一个状态转换过程中开始另一个状态转换，如果中间发生异常，是否会导致状态的异常。这就需要说到状态机的 **Processing model** 了。

一般状态机的 Processing Model 是 [run-to-completion](https://en.wikipedia.org/wiki/UML_state_machine#Run-to-completion_execution_model) (RTC)，这意味着在处理完一个事件之后，状态机才会处理下一个事件。尽管有些状态机也支持非RTC的执行方式，但通常这并不常见。