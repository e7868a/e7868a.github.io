---
title: Python 数据类型与变量
order: 2
date: 2024-12-19
category: Python 学习
---

# Python 数据类型与变量

在这一课中，我们将学习 Python 的基本数据类型和变量的使用。

## 变量

在 Python 中，变量是用来存储数据的容器。Python 是动态类型语言，不需要显式声明变量类型。

```python
# 创建变量
name = "张三"
age = 25
height = 175.5
is_student = True
```

### 变量命名规则

1. 变量名只能包含字母、数字和下划线
2. 变量名不能以数字开头
3. 变量名区分大小写
4. 不能使用 Python 关键字

```python
# 正确的变量名
user_name = "Alice"
user1 = "Bob"
_private_var = "secret"

# 错误的变量名
# 2name = "error"  # 不能以数字开头
# class = "error"  # 不能使用关键字
```

## 基本数据类型

### 1. 数字类型

#### 整数 (int)

```python
positive_num = 42
negative_num = -17
zero = 0
big_number = 1000000

# 可以使用下划线分隔大数字，提高可读性
big_number = 1_000_000
```

#### 浮点数 (float)

```python
pi = 3.14159
temperature = -5.5
scientific = 1.5e-4  # 科学计数法
```

#### 复数 (complex)

```python
complex_num = 3 + 4j
print(complex_num.real)  # 实部: 3.0
print(complex_num.imag)  # 虚部: 4.0
```

### 2. 字符串 (str)

字符串是字符的序列，用引号包围。

```python
# 单引号
single_quote = 'Hello'

# 双引号
double_quote = "World"

# 三引号（多行字符串）
multi_line = """
这是一个
多行字符串
示例
"""

# 字符串拼接
full_name = "张" + "三"
greeting = f"你好，{full_name}！"  # f-string
```

#### 常用字符串方法

```python
text = "Hello, Python!"

print(text.upper())      # HELLO, PYTHON!
print(text.lower())      # hello, python!
print(text.replace("Hello", "Hi"))  # Hi, Python!
print(len(text))         # 14
print(text.split(","))   # ['Hello', ' Python!']
```

### 3. 布尔类型 (bool)

布尔类型只有两个值：`True` 和 `False`。

```python
is_sunny = True
is_raining = False

# 布尔运算
print(is_sunny and is_raining)  # False
print(is_sunny or is_raining)   # True
print(not is_raining)           # True
```

## 类型转换

Python 提供了内置函数来转换数据类型。

```python
# 转换为整数
num_str = "123"
num_int = int(num_str)
print(num_int)  # 123

# 转换为浮点数
num_float = float("3.14")
print(num_float)  # 3.14

# 转换为字符串
age = 25
age_str = str(age)
print(age_str)  # "25"

# 转换为布尔值
print(bool(1))    # True
print(bool(0))    # False
print(bool(""))   # False
print(bool("hi")) # True
```

## 检查数据类型

使用 `type()` 函数可以查看变量的数据类型。

```python
name = "Alice"
age = 30
height = 165.5
is_student = False

print(type(name))       # <class 'str'>
print(type(age))        # <class 'int'>
print(type(height))     # <class 'float'>
print(type(is_student)) # <class 'bool'>
```

## 输入和输出

### 输出 - print()

```python
print("Hello, World!")
print("姓名:", "张三", "年龄:", 25)
print(f"我的名字是 {name}，今年 {age} 岁")
```

### 输入 - input()

```python
# input() 总是返回字符串
user_name = input("请输入你的姓名: ")
user_age = input("请输入你的年龄: ")

# 需要转换类型
user_age = int(user_age)

print(f"你好 {user_name}，你今年 {user_age} 岁")
```

## 实践示例

让我们创建一个简单的个人信息收集程序：

```python
# 个人信息收集程序
print("=== 个人信息收集 ===")

# 收集信息
name = input("请输入姓名: ")
age = int(input("请输入年龄: "))
height = float(input("请输入身高(cm): "))
is_student = input("是否为学生(y/n): ").lower() == 'y'

# 显示信息
print("\n=== 您的信息 ===")
print(f"姓名: {name}")
print(f"年龄: {age} 岁")
print(f"身高: {height} cm")
print(f"学生身份: {'是' if is_student else '否'}")

# 类型信息
print("\n=== 数据类型 ===")
print(f"姓名类型: {type(name)}")
print(f"年龄类型: {type(age)}")
print(f"身高类型: {type(height)}")
print(f"学生身份类型: {type(is_student)}")
```

## 小结

在这一课中，我们学习了：

- 变量的创建和命名规则
- Python 的基本数据类型：整数、浮点数、字符串、布尔值
- 数据类型转换
- 输入输出操作
- 如何检查变量的数据类型

## 练习

1. 创建不同类型的变量并打印它们的值和类型
2. 编写一个程序，计算圆的面积（提示：面积 = π × 半径²）
3. 创建一个简单的计算器，接受两个数字和一个运算符

---

**上一课：** [Python 基础入门](/learn-python/01-python-basics/)  
**下一课：** [Python 控制结构](/learn-python/03-control-structures/)