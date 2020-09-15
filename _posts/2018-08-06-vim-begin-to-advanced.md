---
title: VIM 从入门到进阶
category: 软件开发
---

### VIM 的三种模式

#### 命令模式（Command mode)

vim 打开后就进入这个模式，所有的输入会被当成命令，不能输入字符。
命令模式下有3个选择：
* 使用各种命令对文本进行操作
* 按下 `i a I A` 等输入命令中的一个，进入 `输入模式`
* 按下 `:` 进入 `底线命令模式`

#### 输入模式 (Insert mode)

这个模式下，可以像个正常编辑器一样，输入字符编辑。按 `<ESC>` 回到`命令模式`

#### 底线命令模式 （Last line mode）

可以执行 `Ex Command`，包括保存文件，退出 vim 等操作，必须在这个模式执行。

常见的 `Ex Command`：

| Ex Command | 含义 |
| --- | ---|
| q  | 退出 vim，如果文件被修改了，则不能退出 |
| wq | 先保存文件，再退出 |
| q! | 不保存退出 |
| w | 保存文件 |
| e {filename} | 打开 {filename} 文件 |
| help | 打开帮助文档，基本没啥用，需要先学会怎么看帮助文件 |

#### 初次使用

1. vim a.txt           // 打开 a.txt 这个文件
2. 按 `i` 进入输入模式
3. 像个正常编辑器一下编辑文件
4. 按 `<ESC>` 返回命令模式
5. 按 `:` 进入底线命令模式
6. 输入 `wq <回车>`，保存文件并退出

### 常见的命令

Q: 为什么不能像个正常编辑器一样使用？
A: 命令模式的功能太强大了

#### 移动光标 (motion command)

| command | note |
| --- | --- |
| h | 左移 |
| j | 下移 |
| k | 上移 |
| l | 右移 |
| 0 | 当前行第1个字符 |
| ^ | 当前行第1个非空字符 |
| $ | 当前行的结尾 |
| w | 向前移动一个 word |
| b | 向后移动一个 word |
| gg | 到第 1 行 |
| G | 到最后一行 |
| M | 到屏幕中间的一行 |

#### 输入命令，进入输入模式

| command | note |
| --- | --- |
| a | 在当标的后面 Append 文本 |
| A | 在当前行的末尾 Append 文本 |
| i | 在光标前 Insert 文本 |
| I | 在当前行最前面不为空的位置 Insert 文本 |
| o | 在光标之下新插入一行，并 Insert 文本 |
| O | 在当标之上新插入一行，并 Insert 文本 |
| c{motion} | 删除某个方向的字符，并进入 Insert 模式 |
| C | 从光标删除到行尾，并进入 Insert 模式 |

#### 删除命令

| command | note |
| --- | --- |
| x | 删除光标后面的字符 |
| X | 删除光标前面的字符 |
| d{motion} | 删除某个方向的字符 |
| D | 删除光标到行尾的所有内容 |
| dd | 删除一行 |

#### Undo/Redo/Repeat

| command | note |
| --- | --- |
| u | Undo |
| Ctrl-r | Redo |
| . | Repeat |

### 更强大一点

#### 块操作

| command | note |
| --- | --- |
| v | 按字符高亮 |
| V | 整行高亮 |
| Ctrl-v | 垂直高亮 |
| < | 左移 |
| > | 右移 |
| = | 自动缩进 |

在所有行中插入内容：
```
Ctrl-v
选择要插入的行
按 I 插入到光标前面
输入要插入的内容，按 `<ESC>` 完成
```
在所有行尾 Append 内容
```
Ctrl-v
选择要追加的行
按 $ 到行尾
按 A 进入输入模式
输入要追加的内容，按 `<ESC>` 完成
```

#### 复制粘贴

| command | note |
| --- | --- |
| yy | 复制一行 |
| y | 复制当标下的字符 |
| {visual}y | 复制高亮区域 |
| p | 粘贴到当标字符的后面 |
| P | 粘贴到光标字符的前面 |
| "+y | 复制到系统剪切板 |
| "+p | 从系统剪切板复制 |
| "{a-zA-Z0-9} | 指定寄存器 |
| :reg | 查看寄存器 |

#### 多次重复

命令前按数字，表示重复执行多次命令

| command | note |
| --- | --- |
| 10p | 复制 10 次 |
| 9h | 左移9个字符 |
| 3x | 删除 3 个字符 |
| 3dd | 删除 3 行 |

#### 搜索

| command | note |
| --- | --- |
| /{pattern} | 向前搜索 |
| ?{pattern} | 向后搜索 |
| n | 光标移至下一个匹配 |
| N | 光标移至上一个匹配 |
| * | 把光标下的词作为 {pattern} 向前搜索 |
| # | 把光标下的词作为 {pattern} 向后搜索 |
| % | 找到另一半的 `( { [` |

vim 默认使用 Basic Regular Expressions ，扩展符号需要转义 `\+ \? \( \) \{ \} \|` 

#### Changing (or Replacing) Text

| command | note |
| --- | --- |
| {visual}u | 转小写 |
| {visual}U | 转大写 |
| {visual}~ | 切换大小写 |
| r{char} | 把光标下的字符替换为 {char} |
| R | 进入替换模式，直到 `<ESC>` 退出 |

#### 窗口管理

| command | note |
| --- | --- |
| Ctrl-w-s | 水平切分为两个窗口 |
| Ctrl-w-v | 垂直切分 为两个窗口 |
| Ctrl-w-c | 关闭光标所在的窗口 |
| Ctrl-w-h | 光标移动到左边的窗口 |
| Ctrl-w-j | 光标移动到下边的窗口 |
| Ctrl-w-k | 光标移动到上边的窗口 |
| Ctrl-w-l | 光标移动到右边的窗口 |

#### 窗口管理

| command | note |
| --- | --- |
| Ctrl-w-s | 水平切分为两个窗口 |
| Ctrl-w-v | 垂直切分 为两个窗口 |
| Ctrl-w-c | 关闭光标所在的窗口 |
| Ctrl-w-h | 光标移动到左边的窗口 |
| Ctrl-w-j | 光标移动到下边的窗口 |
| Ctrl-w-k | 光标移动到上边的窗口 |
| Ctrl-w-l | 光标移动到右边的窗口 |

### 更强大的 `Ex Command`

按 `:` 进入底线命令模式后，可以执行以下命令。

| command | note |
| --- | --- |
| 5,16d | 删除第 5-16 行 |
| %d | 删除所有行 |
| %s/{pattern}/string/gc | 类似于 sed 操作|
| %g/{pattern}/d | 删除 {pattern} 的行 |
| %g!/{pattern}/d | 删除不匹配的行 |
| %v/{pattern}/d | v 相当于 g!  |
| %!xxd | 将所有行转换为十六进制 |
| %!xxd -r | 从十六进制形式返回 |
| r {filename} | 把 {filename} 的内容读到光标下 |
| r !{command} | 把 {command} 命令的输出读到光标下 |
| set fenc=cp936 | 设置文件编码 |
| set bomb | 设置 BOM 头 |
| set nobomb | 设置没有 BOM 头 |
| set bomb? | 查看是否有 BOM 头 |
| imap jj `<ESC>` | 输入模式时，输入 `jj` 相当于按 `<ESC>` |
| ! | 查看终端界面 |
| {num} | 光标移到 {num} 对应的行 |

### 其它命令

```shell
vimdiff file1 file2               # 差分两个文件
vim -d file1 file2                # 同上
git difftool HEAD HEAD~1          # git 中差分两个版本
```

### `.vimrc` 配置文件
```conf
set nocompatible     " do not compatible with vi
set ruler
set number
set nobackup
set backspace=eol,start,indent
" when indenting with '>', use 4 spaces width
set shiftwidth=4
" show existing tab with 4 spaces width
set tabstop=4
set softtabstop=4
" on pressing tab, insert 4 spaces
set expandtab
set smarttab
set noundofile
set nowrap
set bg=dark
syntax enable
syntax on
filetype on
filetype plugin on
filetype indent on

set fencs=ucs-bom,utf-8,cp936,gb18030,latin1

imap jj <ESC>

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" Status Line
" """"""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" Always hide the statusline
set laststatus=2
" Format the statusline
set statusline=
set statusline+=%2*%-3.3n%0*\                " buffer number
set statusline+=%f\                          " file name
set statusline+=%h%1*%m%r%w%0*               " flags
set statusline+=\[%{strlen(&ft)?&ft:'none'}, " filetype
set statusline+=%{&fileencoding},            " encoding
set statusline+=%{&encoding},                " encoding
set statusline+=%{&fileformat}]              " file format
set statusline+=%=                           " right align
set statusline+=%2*0x%-8B\                   " current char
set statusline+=%-14.(%l,%c%V%)\ %<%P        " offset
```

参考资料：\\
[简明 VIM 练级攻略](https://coolshell.cn/articles/5426.html) \\
[VIM Tips Wiki](https://vim.fandom.com/wiki/Vim_Tips_Wiki)