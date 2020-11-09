---
title: supervisord 中的 open files 数量限制
category: 系统运维
---

### Linux 中的 nofile 设置

Linux 系统通过 rlimit 来对一个进程可以使用的计算机资源进行限制，其中 nofile 表示单个进程可以打开的文件句柄数，默认值为 1024。 我们知道，Linux 系统下一切都是文件，这不仅包括了常规的文件，还包括 socket, pipe 等等，对于一些较大的应用，如数据库，Web 服务器等，1024 这个限制肯定是不够的。所以一般在初始化新服务器时都要进行修改，例如修改 /etc/security/limits.conf，把所有用户的 nofile 限制设置为 65535，其中，`*` 不能用于 root 用户，root 用户必须显式地使用 root 定义。
```conf
root soft nofile 65535
root hard nofile 65535
* soft nofile 65535
* hard nofile 65535
```
查看当前 Shell 的 nofile 限制，可以使用
```
> ulimit -n
65535
```
查看某一个进程的 nofile 限制，可以使用
```shell
> cat /proc/$PID/limits
Limit                     Soft Limit           Hard Limit           Units
Max cpu time              unlimited            unlimited            seconds
Max file size             unlimited            unlimited            bytes
Max data size             unlimited            unlimited            bytes
Max stack size            8388608              unlimited            bytes
Max core file size        0                    unlimited            bytes
Max resident set          unlimited            unlimited            bytes
Max processes             15076                15076                processes
Max open files            65500                65500                files
Max locked memory         65536                65536                bytes
Max address space         unlimited            unlimited            bytes
Max file locks            unlimited            unlimited            locks
Max pending signals       15076                15076                signals
Max msgqueue size         819200               819200               bytes
Max nice priority         0                    0
Max realtime priority     0                    0
Max realtime timeout      unlimited            unlimited            us
```
刚刚接触的时候，会比较疑惑“Soft Limit" 和 ”Hard Limit" 是什么区别？其实这是一个非常巧妙的设计，我们在实际工作中，对不同进程的资源限制往往是不一样的，需要能够灵活地配置。“Soft Limit"就是这样的作用，用户可以自由地增加或减小 ”Soft Limit"的值，让自己的进程有不同的资源限制。而“Hard Limit"则代表了这个用户能设置的资源限制的最大值。当然这里的用户指的是非 root 用户。

### supervisord 中的 nofile 坑

supervisord 是一个常用的进程管理工具，不仅可以简化进程的启动操作，还可以在进程意外退出时自动重启。但是这里有一个坑是，默认情况下，我们会发现 supervisord 启动的进程，并不会使用 /etc/security/limits.conf 中配置的 nofile 数值，而是会默认设置为 1024。

检查 supervisord 的配置文件 /etc/supervisor.conf 中，会发现一个 minfds 的参数设置了 nofile 限制，默认为 1024。难道是 supervisord 的配置限制了 nofile ？
```conf
[supervisord]

minfds=1024                 ; (min. avail startup file descriptors;default 1024)
minprocs=200                ; (min. avail process descriptors;default 200)
```
这里需要注意的另一个点是这里的 minprocs 参数，minprocs 对应的是 rlimit 中的 `nproc`, nproc 代表一个进程最多可以创建的线程数。这里设置成了 200，但是我们查看 supervisord 进程的 limits 时，`Max processes` 却不是 200。说明这个配置其实并没有生效。

还好，我们可以查看 supervisord 的源码，访问：https://github.com/Supervisor/supervisor/blob/master/supervisor/options.py#L1466，
```python
            soft, hard = resource.getrlimit(res)

            if (soft < min_limit) and (soft != -1): # -1 means unlimited
                if (hard < min_limit) and (hard != -1):
                    # setrlimit should increase the hard limit if we are
                    # root, if not then setrlimit raises and we print usage
                    hard = min_limit

                try:
                    resource.setrlimit(res, (min_limit, hard))
                    self.parse_infos.append('Increased %(name)s limit to '
                                '%(min_limit)s' % locals())
                except (resource.error, ValueError):
                    self.usage(msg % locals())
```
这里可以看出，只有当前 limit **小于**配置文件中的值时才会调用 `setrlimit`。这说明系统中配置的 `rlimit` 并没有生效。

其实 /etc/security/limits.conf 文件的开头已经写得很明白了。
```shell
> head /etc/security/limits.conf
# /etc/security/limits.conf
#
#This file sets the resource limits for the users logged in via PAM.
#It does not affect resource limits of the system services.
#
```
/etc/security/limits.conf 中的配置对 systemd 启动的进程是无效的。我们的 supervisord 是通过 systemd 启动的，在没有设置的情况下，使用的是系统默认的 nofile 限制数据，Soft Limit 为 1024，Hard Limit 为 4096。

systemd 中的 nofile，要通过 LimitNOFILE 参数设置，例如编辑 /usr/lib/systemd/system/supervisord.service 将LimitNOFILE设置为 10000。
```conf
[Unit]
Description=Process Monitoring and Control Daemon
After=rc-local.service nss-user-lookup.target

[Service]
Type=forking
LimitNOFILE=10000
ExecStart=/usr/bin/supervisord -c /etc/supervisord.conf

[Install]
WantedBy=multi-user.target
```
保存文件后，需要调用 `systemctl daemon-reload` 刷新服务配置。
```console
# 查看默认的 LimitNOFILE
> systemctl show -p DefaultLimitNOFILE
4096
# 查看某一个 Service 的 LimitNOFILE
> systemctl show supervisord -p LimitNOFILE
10000
```