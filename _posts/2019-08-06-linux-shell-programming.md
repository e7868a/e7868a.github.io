---
title: Linux Shell 编程
category: 软件开发
---

本文源于团队内部的一次分享，对 Linux Shell 编程进行基本的介绍。

### 基本的文件格式
```bash
#!/bin/sh         => 指定要运行的 shell
or
#!/bin/bash      => bash 是功能更全的一个 shell

foo1=abc 
foo2=abc 123      => illegal
foo3='abc 123' 
foo4=1+2 

echo $foo1        => abc
echo $foo3        => abc 123
echo $foo4        => 1+2

bar1=$foo1

echo $bar1        => abc

echo "the value is $foo1"            => the value is abc
echo "the value is $foo1foo"         => the value is 
echo "the value is ${foo1}foo"       => the value is abcfoo
echo 'the value is $foo1'            => the value is $foo1
```
### 执行一个 Shell Script
```bash
chmod a+x example1.sh        # 增加可执行标志
./example1.sh                # 直接运行，使用文件中定义的 shell 执行

sh exmaple.sh                # 使用 sh 执行

source example1.sh           # 在同一个 shell 中执行
```

### 环境变量
```bash
#!/bin/sh

echo "The program $0 is now running."    # shell 脚本的名字
echo "The PID is $$"                     # PID
echo "There are $# parameters."          # 有几个参数
echo "The first parameter: $1"           # 第1个参数
echo "The second parameter: $2"          # 第2个参数
echo "The parameter list: $@"            # 参数列表
echo $HOME                               # HOME 目录
echo $PATH                               # PATH 变量

# 使用 export 定义子 Shell 可以识别的环境变量
export MY_VAR="A variable can be seen by sub shell"
export -p           # 列出所有的环境变量

VAR_1="子shell中看不到这个变量"
export VAR_2="子shell中可以看到这个变量"
call_some_script
```
运行 `./examp2.sh foo bar`，得到以下结果
```
The program ./b.sh is now running.
The PID is 2974
There are 2 parameters.
The first parameter: foo
The second parameter: bar
The parameter list: foo bar
/home/username
/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games
```
### 条件控制和循环
```bash
#!/bin/sh

echo "Please input a or b:"
# 从终端读入一个变量
read foo

# 条件判断
if [ "$foo" = "a" ]; then
    echo "You input a."
elif [ "$foo" = "b" ]; then
    echo "You input b."
else
    echo "Wrong input. Please input a or b."
fi

# 有缺陷的写法
if [ $foo = "a" ]; then
fi

# for 循环
for foo in a b c d e f 
do
    echo $foo
done

for foo in $(ls *.sh)
do
    echo $foo
done

# while 循环
foo=1
while [ $foo -lt 10 ]
do
    foo=$(($foo+1))
    echo $foo
done

bar=$(date "+%Y-%m-%d %H:%M:%S")
echo $bar                         => 2020-02-25 21:36:50

bar=$((100*200+1))
echo $bar                         => 20001
```

常用的条件判断：

| 形式                 | 含义                         | 举例                       |
| -------------------- | ---------------------------- | -------------------------- |
| `-n` STRING          | STRING 长度不为 0            | [ -n "abc" ]               |
| `-z` STRING          | STRING 长度为 0              | [ -z "abc" ]               |
| STRING1 `=` STRING2  | STRING1 与 STRING2 相等      | [ "$var" = "abc" ]         |
| STRING1 `!=` STRING2 | STRING1 与 STRING2 不相等    | [ "$var" != "abc" ]        |
| INT1 `-eq` INT2      | INT1 等于 INT2   (equal)     | [ "$var" -eq 100 ]         |
| INT1 `-ge` INT2      | INT1 >= INT2 (great equal)   | [ "$var" -ge 100 ]         |
| INT1 `-gt` INT2      | INT1 > INT2 (great than)     | [ "$var" -gt 100 ]         |
| INT1 `-le` INT2      | INT1 <= INT2 (less equal)    | [ "$var" -le 100 ]         |
| INT1 `-lt` INT2      | INT1 < INT2 (less than)      | [ "$var" -lt 100 ]         |
| INT1 `-ne` INT2      | INT1 不等于 INT2 (not equal) | [ "$var" -ne 100 ]         |
| `-d` FILE            | FILE 存在并且是个目录        | [ -f /opt/some/directory ] |
| `-e` FILE            | FILE 存在                    | [ -e /path/to/some/file ]  |
| `-f` FILE            | FILE 存在并且是个常规文件    | [ -f /path/to/some/file ]  |

### 函数
```bash
#!/bin/sh

some_var=abc

foo() {
    local some_var="123"
    echo "some_var=$some_var"

    echo "There are $# parameters."         # => 3
    echo "The first parameter: $1"          # => a
    echo "The second parameter: $2"         # => b
    echo "The parameter list: $@"           # => a b c
}

foo a b c

bar() {
    echo "output from bar."
    return 13
}

result=$(bar)
echo $result                # => output from bar.
echo $?                     # => 13
```

### 有用的选项
```bash
#!/bin/sh
set -e             # 遇到失败的命令时停止执行
set -x             # 打印执行的详细命令
```
```bash
+ some_var=abc
+ foo a b c
+ local some_var=123
+ echo some_var=123
some_var=123
+ echo There are 3 parameters.
There are 3 parameters.
+ echo The first parameter: a
The first parameter: a
+ echo The second parameter: b
The second parameter: b
+ echo The parameter list: a b c
The parameter list: a b c
+ bar
+ echo output from bar.
+ return 13
+ result=output from bar.
```

### 字符串高级用法
```bash
#!/bin/bash

STR="abcabcdefgdefg"

echo ${#STR}              => 14
echo ${EMPTY:-123}        => 123
echo ${STR%d*g}           => abcabcdefg
echo ${STR%%d*g}          => abcabc
echo ${STR#a*c}           => abcdefgdefg
echo ${STR##a*c}          => defgdefg

# bash only
echo ${STR:3:4}                => abcd     
echo ${STR:3}                  => abdefgdefg
echo ${STR:$((${#STR}-4)):4}   => defg 
```