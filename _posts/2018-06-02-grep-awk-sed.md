---
title: 文本处理三大利器：grep awk sed
category: 系统运维
---

在计算机编程和系统管理中，文本处理是一项非常重要的任务。grep、awk和sed是三种流行的文本处理工具，它们可以让你在命令行中快速处理文本数据。以下是这三种工具的简要介绍：

### Unix 哲学

- 程序应该只关注一个目标，并尽可能把它做好。
- 让程序能够互相协同工作。
- 应该让程序处理文本数据流，因为这是一个通用的接口。

### grep

`grep`(Global Regular Expression Print) 主要用来在一个文件中搜索特定字符串。

```
grep 'test' file.txt # 输出 file.txt 中所有匹配 test 的行

```

#### 参数列表

| 参数 | 说明 |
| --- | --- |
| -n | 显示行号 |
| -v | 显示不匹配的行 |
| -o | 只显示匹配的内容 |
| -c | 显示匹配的行数 |
| -i | 忽略大小写 |
| -E | 使用扩展的正则表达式，相当于使用 egrep |
| -P | 使用 Perl 正则表达式 |
| -l | 在多个文件中操作时，只显示文件名 |
| -x | 显示exact匹配的行 |
| -An | 显示匹配行的同时，再附加这一行下面的 n 行 |
| -F | 不使用正则表达式，只匹配字符串内容 |
| -r | 递归搜索子目录 |

#### Basic Regular Expressions (BRE) vs Extended Regular Expressions (ERE)

通用的符号：

> . ^ $ * [ ]
> 

ERE 符号 (egrep awk emacs)：

> \+ ? ( ) { } |
> 

BRE 符号 (grep sed vim)：

> \\+ \\? \\( \\) \\{ \\} \\|
> 

#### Perl Regular Expressions

| Greedy quantifier | Lazy quantifier | Description |
| --- | --- | --- |
| * | *? | Star Quantifier: 0 or more |
| + | +? | Plus Quantifier: 1 or more |
| ? | ?? | Optional Quantifier: 0 or 1 |
| {n} | {n}? | Quantifier: exactly n |
| {n,} | {n,}? | Quantifier: n or more |
| {n,m} | {n,m}? | Quantifier: between n and m |

### awk

`awk` 主要用于文本扫描和处理，名字来源于它的三位作者 Aho, Weinberger & Kernighan (K&R中的K)。

```
BEGIN { ... initialization awk commands ...}
{ ... awk commands for each line of the file ...}
END { ... finalization awk commands ...}

```

#### 内置的变量

| Variable | Meaning |
| --- | --- |
| $0 | 当前行 |
| $1 - $n | 第几个字段 |
| FS | 输入的列间隔符 默认值：“ “ |
| NF | 列数 |
| NR | 第几行 |
| FNR | 当前文件的第几行 |
| OFS | 输出的列间隔符 默认值：“ “ |
| ORS | 输出的行间隔符 默认值：“\n” |

假设文件 file.txt 的内容如下：

```
zhang M 1
lee M 2
song F 9
wang F 11

```

```
awk '{print $1,$NF,NF}' file.txt

awk 'BEGIN {SUM=0} {SUM=SUM+$3} END { print SUM, SUM/NR}' file.txt

# 假设以逗号为分隔符
zhang , M , 1
lee , M , 2
song , F , 9
wang , F , 11

awk -F, '{print $1,$NF}' file.txt
awk 'BEGIN {FS=","} {print $1,$NF}' file.txt

```

#### 条件控制

```
if (condition) statement [ else statement ]
while (condition) statement
do statement while (condition)
for (expr1; expr2; expr3) statement
for (var in array) statement
break
continue
exit [ expression ]

```

```
# 计算所有第2列为“M"的行中，第3列数据的总和和平均值
awk 'BEGIN {SUM=0;CNT=0} {if ($2 == "M") {SUM=SUM+$3 ;CNT=CNT+1} } \\
END { print SUM, SUM/CNT}' file.txt

# 计算文件中一共第2列每种类型的个数
awk '{SUM[$2] += 1} END {for (s in SUM) print s,SUM[s]}' file.txt

```

#### 字符串匹配

```
awk '{if ($1 == "zhang") print $0}' file.txt # 字符串相等
awk '{if ($1 ~ /ang/) print $0}' file.txt # 匹配正则表达式
awk '{if ($1 !~ /ang/) print $0}' file.txt # 不匹配正则表达式

```

#### 内置函数

参考 [https://www.tutorialspoint.com/awk/awk_built_in_functions.htm](https://www.tutorialspoint.com/awk/awk_built_in_functions.htm)

```
# 使用 printf 格式化输出
awk 'BEGIN {SUM=0;CNT=0} {if ($2 == "M") {SUM=SUM+$3 ;CNT=CNT+1} } \\
END {printf("sum: %d, avg: %.2f\\n", SUM, SUM/CNT)}' file.txt

```

#### 以脚本形式执行

```
#!/usr/bin/awk -f

BEGIN {
SUM=0;
CNT=0
}
{
if ($2 == "M") {
SUM=SUM+$3 ;
CNT=CNT+1
}
}
END {
printf("sum: %d, avg: %.2f\\n", SUM, SUM/CNT)
}

```

```
chmod a+x ./awk_script
./awk_script file.txt

```

### sed

`sed` 表示"Stream Editor"，用来对文本或流进行编辑。

假设文件 file.txt 内容如下：

```
zhang,zhang,M,123
zhang,lee,M,124
lee,san,F,10
wang,wu,M,23

```

#### 删除某行：d 命令

```
sed '/zhang/d' file.txt # 删除匹配的行
sed '/zhang.*lee/d' file.txt # 删除匹配的行
sed '/zhang.*lee/!d' file.txt # 删除不匹配的行
sed '2d' file.txt # 删除第2行
sed '1,2d' file.txt # 删除第1至第2行
sed '2,$d' file.txt # 删除第2行至最末

```

#### 文本替换：s 命令

```
sed 's/zhang/angy/' file.txt # 将所有行第1个 zhang 替换为 angy
sed 's/zhang/angy/g' file.txt # 将所有行所有的 zhang 替换为 angy
sed 's/zhang/angy/2' file.txt # 将所有行第2个 zhang 替换为 angy
sed 's/zhang/angy/2g' file.txt # 将所有行第2个至最后一个 zhang 替换为 angy
sed '2,3s/zhang/angy/g' file.txt # 将第2行至第3行所有的 zhang 替换为 angy
sed '3,$s/zhang/angy/g' file.txt # 将第3行至最后一行所有的 zhang 替换为 angy

```

#### 插入和追加一行： i & a 命令

```
sed '2 i test' file.txt # 在第2行之前插入新行，内容为 test
sed '2 a test' file.txt # 在第2后之后追加新行，内容为 test
sed '/zhang/a append line' file.txt # 在所有包含 zhang 的行的后面追加新行

```

#### 替换整行：c 命令

```
sed '2 c test' file.txt # 将第2行的内容替换为 test

# 将所有包含 zhang 的行替换为 changed line
sed '/zhang/c changed line' file.txt

```

#### 修改原始文件

```
# 直接将 file.txt 中 所有行的第1个 zhang 替换为 angy
sed -i 's/zhang/angy/' file.txt
# 在 file.txt 中完成替换，并将原始文件另存为 file.txt.bak
sed -i.bak 's/zhang/angy/' file.txt

```

#### 综合使用

```
cat file.txt | sed '/lee/d' | awk -F, '{print $1,$2}'

zhang zhang
wang wu

```