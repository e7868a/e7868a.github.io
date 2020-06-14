---
title: Windows 下编译 ZooKeeper
---

ZooKeeper 号称 Windows 下也可以用 C++ 做开发用。并提供了 zookeeper.sln、zookeeper.vcproj 的工程文件。但是如果你用 VC2008 去打开它的话，就会报错，说工程里已添加了一个工程云云。

实际上解决办法很简单，用文本编辑打开 zookeeper.sln 和 zookeeper.vcproj 会发现里面写入了两组工程文件内容，估计是自动生成的。把其中的一组删掉就可以了。