---
title: Python 控制结构
order: 3
date: 2024-12-19
category: Python 学习
---

# Python 控制结构

控制结构是编程语言的核心组成部分，它们决定了程序的执行流程。在这一课中，我们将学习 Python 的条件语句和循环语句。

## 条件语句

条件语句允许程序根据不同的条件执行不同的代码块。

### if 语句

最基本的条件语句是 `if` 语句：

```python
age = 18

if age >= 18:
    print("你已经成年了")
```

### if-else 语句

当条件不满足时，可以执行另一段代码：

```python
age = 16

if age >= 18:
    print("你已经成年了")
else:
    print("你还未成年")
```

### if-elif-else 语句

当有多个条件需要判断时，使用 `elif`：

```python
score = 85

if score >= 90:
    grade = "A"
elif score >= 80:
    grade = "B"
elif score >= 70:
    grade = "C"
elif score >= 60:
    grade = "D"
else:
    grade = "F"

print(f"你的成绩等级是: {grade}")
```

### 嵌套条件语句

条件语句可以嵌套使用：

```python
weather = "晴天"
temperature = 25

if weather == "晴天":
    if temperature > 20:
        print("天气很好，适合出门")
    else:
        print("天气晴朗但有点冷")
else:
    print("天气不太好")
```

## 比较运算符

Python 提供了多种比较运算符：

```python
a = 10
b = 20

print(a == b)   # 等于: False
print(a != b)   # 不等于: True
print(a < b)    # 小于: True
print(a > b)    # 大于: False
print(a <= b)   # 小于等于: True
print(a >= b)   # 大于等于: False
```

## 逻辑运算符

逻辑运算符用于组合多个条件：

```python
age = 25
income = 50000

# and: 所有条件都为真时返回真
if age >= 18 and income >= 30000:
    print("符合贷款条件")

# or: 任一条件为真时返回真
if age < 18 or age > 65:
    print("享受优惠票价")

# not: 取反
if not (age < 18):
    print("不是未成年人")
```

## 成员运算符

检查元素是否在序列中：

```python
fruits = ["苹果", "香蕉", "橙子"]

if "苹果" in fruits:
    print("有苹果")

if "葡萄" not in fruits:
    print("没有葡萄")
```

## 循环语句

循环语句允许重复执行代码块。

### for 循环

`for` 循环用于遍历序列（如列表、字符串、范围等）：

#### 遍历列表

```python
fruits = ["苹果", "香蕉", "橙子"]

for fruit in fruits:
    print(f"我喜欢吃{fruit}")
```

#### 遍历字符串

```python
word = "Python"

for char in word:
    print(char)
```

#### 使用 range()

```python
# 打印 0 到 4
for i in range(5):
    print(i)

# 打印 1 到 10
for i in range(1, 11):
    print(i)

# 打印 0 到 10 的偶数
for i in range(0, 11, 2):
    print(i)
```

#### enumerate() 函数

同时获取索引和值：

```python
fruits = ["苹果", "香蕉", "橙子"]

for index, fruit in enumerate(fruits):
    print(f"{index}: {fruit}")
```

### while 循环

`while` 循环在条件为真时重复执行：

```python
count = 0

while count < 5:
    print(f"计数: {count}")
    count += 1  # 等同于 count = count + 1
```

#### 用户输入循环

```python
while True:
    user_input = input("请输入一个数字 (输入 'quit' 退出): ")
    
    if user_input == 'quit':
        break
    
    try:
        number = int(user_input)
        print(f"你输入的数字是: {number}")
    except ValueError:
        print("请输入有效的数字")
```

## 循环控制语句

### break 语句

`break` 用于跳出循环：

```python
for i in range(10):
    if i == 5:
        break
    print(i)
# 输出: 0, 1, 2, 3, 4
```

### continue 语句

`continue` 用于跳过当前迭代，继续下一次迭代：

```python
for i in range(10):
    if i % 2 == 0:  # 跳过偶数
        continue
    print(i)
# 输出: 1, 3, 5, 7, 9
```

### else 子句

循环可以有 `else` 子句，当循环正常结束时执行：

```python
for i in range(5):
    print(i)
else:
    print("循环正常结束")

# 如果使用 break 跳出循环，else 不会执行
for i in range(5):
    if i == 3:
        break
    print(i)
else:
    print("这不会被打印")
```

## 实践示例

### 示例1：猜数字游戏

```python
import random

# 生成 1-100 的随机数
secret_number = random.randint(1, 100)
guess_count = 0
max_guesses = 7

print("欢迎来到猜数字游戏！")
print(f"我想了一个 1-100 之间的数字，你有 {max_guesses} 次机会猜中它。")

while guess_count < max_guesses:
    try:
        guess = int(input("请输入你的猜测: "))
        guess_count += 1
        
        if guess == secret_number:
            print(f"恭喜！你猜中了！数字就是 {secret_number}")
            print(f"你用了 {guess_count} 次猜中了！")
            break
        elif guess < secret_number:
            print("太小了！")
        else:
            print("太大了！")
            
        remaining = max_guesses - guess_count
        if remaining > 0:
            print(f"你还有 {remaining} 次机会")
            
    except ValueError:
        print("请输入有效的数字！")
        guess_count -= 1  # 无效输入不计入次数
else:
    print(f"游戏结束！正确答案是 {secret_number}")
```

### 示例2：计算阶乘

```python
def calculate_factorial(n):
    """计算 n 的阶乘"""
    if n < 0:
        return "阶乘不能为负数"
    elif n == 0 or n == 1:
        return 1
    else:
        factorial = 1
        for i in range(2, n + 1):
            factorial *= i
        return factorial

# 测试
number = int(input("请输入一个非负整数: "))
result = calculate_factorial(number)
print(f"{number}! = {result}")
```

### 示例3：打印乘法表

```python
print("九九乘法表:")
print("-" * 50)

for i in range(1, 10):
    for j in range(1, i + 1):
        result = i * j
        print(f"{j}×{i}={result:2d}", end="  ")
    print()  # 换行
```

## 小结

在这一课中，我们学习了：

- **条件语句**：`if`、`elif`、`else`
- **比较运算符**：`==`、`!=`、`<`、`>`、`<=`、`>=`
- **逻辑运算符**：`and`、`or`、`not`
- **循环语句**：`for` 和 `while`
- **循环控制**：`break`、`continue`、`else`
- **实用函数**：`range()`、`enumerate()`

## 练习

1. **成绩分级程序**：编写程序输入学生成绩，输出对应等级（A、B、C、D、F）

2. **素数判断**：编写程序判断一个数是否为素数

3. **斐波那契数列**：打印前 n 个斐波那契数

4. **密码验证**：编写程序验证密码强度（长度、大小写、数字、特殊字符）

5. **简单计算器**：实现一个支持四则运算的计算器，可以连续计算

---

**上一课：** [Python 数据类型与变量](/learn-python/02-data-types/)  
**下一课：** [Python 数据结构](/learn-python/04-data-structures/)