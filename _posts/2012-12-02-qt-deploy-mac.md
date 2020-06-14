---
title: Mac 下发布 Qt 应用程序
---

Qt编写的应用发布到用户手里，同时也要把 Qt 库一起打包给用户。方法有很多。

**1. 简单又麻烦的办法，静态编译Qt**

简单是因为静态编译的Qt库会随着应用一起发布，麻烦是我们必须自己编译静态的Qt。而且，很多情况下我们不仅是要使用Qt，还有很多其它的库，如果每一个都静态编译，我们的执行文件就太巨大了。所以简单的应用，静态编译可能是好的，但是，比较大的项目，这种方法就不推荐了。

**2. 好又不麻烦的办法，使用Frameworks**

Mac中的GUI应用必须以Bundle的形式运行，所谓Bundle,是一个以".app"结尾命名的文件夹，系统自动识别它为一个应用包，应用所有的东西(执行文件、链接的动态库、资源文件等等)都在里面了，打开应用直接"open myApp.app"就可以了，安装的时候直接把Bundle拖到Finder里就行了。卸载的时候直接把Bundle删除就行了。非常让人省心。

Bundle的结构如下图：(从[Qt文档](http://doc.qt.digia.com/qt/deployment-mac.html)里借来的)

![img](/img/posts/2012120214475239.png)

我们如果要随着我们的应用一起发布Qt库，比较合理的就是把所有需要的Qt库都复制到Frameworks目录中。

使用otool可以查看一个应用都链接了哪些动态库

```console
$ otool -L myApp.app/Contents/MacOS/myApp 
myApp.app/Contents/MacOS/myApp:
    libqxmpp.0.dylib (compatibility version 0.7.0, current version 0.7.4)
    /usr/lib/libz.1.dylib (compatibility version 1.0.0, current version 1.2.5)
    QtWebKit.framework/Versions/4/QtWebKit (compatibility version 4.9.0, current version 4.9.3)
    QtXml.framework/Versions/4/QtXml (compatibility version 4.8.0, current version 4.8.3)
    QtCore.framework/Versions/4/QtCore (compatibility version 4.8.0, current version 4.8.3)
    QtGui.framework/Versions/4/QtGui (compatibility version 4.8.0, current version 4.8.3)
    QtNetwork.framework/Versions/4/QtNetwork (compatibility version 4.8.0, current version 4.8.3)
    /usr/lib/libstdc++.6.dylib (compatibility version 7.0.0, current version 56.0.0)
    /usr/lib/libgcc_s.1.dylib (compatibility version 1.0.0, current version 1669.0.0)
    /usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 169.3.0)
```

我们用了QtWebKit、QtXml、QtCore、QtGui、QtNetwork，然后挨个Copy吧。

```console
$ cp -R /path/to/Qt/lib/QtCore.framework  myApp.app/Contents/Frameworks
...
```

真的悲惨到到自己手工去复制？当然不是，我们都是懒人啊，Qt自身带了一个 macdepolyqt 的神器，一切就变得简单了。

```console
$ macdeployqt myApp.app
  ERROR: no file at "/usr/lib/libqxmpp.0.dylib" 
```

这里报错了，找不到libqxmpp这个库，qxmpp是我们用的一个三方库，并不在/usr/lib下，找不到并不奇怪，怎么才能让macdeployqt找到这个三方库呢？

Mac下是用 DYLD_LIBRARY_PATH 来寻找动态库的，类似于 Linux 下的 LD_LIBRARY_PATH 。otool -L输出的信息，其实是保存在编译好的可执行文件里的。libqxmpp.0.dylib没有指定绝对路径，系统会到DYLD_LIBRARY_PATH中去寻找它，macdepolyqt并不理会DYLD_LIBRARY_PATH，所以，我们只好将libqxmpp.0.dylib这一条修改成它的绝对路径，让macdeployqt可以找到它。

```console
$ install_name_tool -change "libqxmpp.0.dylib" "/opt/library/qxmpp/lib/libqxmpp.0.dylib" \
 myApp.app/Contents/MacOS/myApp
```

如此以后就没问题了

```console
$ macdeployqt fytclient.app

$ otool -L myApp.app/Contents/MacOS/myApp 
myApp.app/Contents/MacOS/myApp:
    @executable_path/../Frameworks/libqxmpp.0.dylib (compatibility version 0.7.0, current version 0.7.4)
    /usr/lib/libz.1.dylib (compatibility version 1.0.0, current version 1.2.5)
    @executable_path/../Frameworks/QtWebKit.framework/Versions/4/QtWebKit (compatibility version 4.9.0, current version 4.9.3)
    @executable_path/../Frameworks/QtXml.framework/Versions/4/QtXml (compatibility version 4.8.0, current version 4.8.3)
    @executable_path/../Frameworks/QtCore.framework/Versions/4/QtCore (compatibility version 4.8.0, current version 4.8.3)
    @executable_path/../Frameworks/QtGui.framework/Versions/4/QtGui (compatibility version 4.8.0, current version 4.8.3)
    @executable_path/../Frameworks/QtNetwork.framework/Versions/4/QtNetwork (compatibility version 4.8.0, current version 4.8.3)
    /usr/lib/libstdc++.6.dylib (compatibility version 7.0.0, current version 56.0.0)
    /usr/lib/libgcc_s.1.dylib (compatibility version 1.0.0, current version 1669.0.0)
    /usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 169.3.0)
```
这时候再看otool的结果，qxmpp以及Qt的动态库都指向了Bundle里Frameworks目录下了。@executable_path顾名思义就是应用的执行目录，也就是myApp.app/Contents/MacOS