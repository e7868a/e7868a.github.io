---
title: Locale 和 LanguageTag
category: 软件开发
---

### “zh_CN”与“zh-CN”

前段时间，在做一个国际化的项目时，关于中文语言是用 "zh_CN" 形式还是 "zh-CN" 形式来表示，团队里出现了一些分歧。借此机会，我查了相关资料，详细了解了有关规则。

### 国际化与本地化

国际化（Internationalization，通常被简称为 I18n）和本地化（Localization，通常被简称为 L10n）是两个看似熟悉但常常需要进一步查阅资料来真正理解的术语。两者虽然相关，但各有侧重点。

对于软件系统来说，国际化是指在设计和开发时，通过一系列操作使系统能够容易地针对不同目标市场进行本地化。例如，使用 UTF-8 编码来存储或传输数据，时间要带时区。语言和系统要分离，通过编辑语言文件即可增加语言支持。在界面设计上要考虑不同语言可能的长度差异，确保不同语言都能正常显示。国际化更像是软件系统的一个能力，是设计和开发时必须考虑的驱动力。

本地化是在国际化的基础上，对特定语言或文化进行适配。比如，针对简体中文的适配就是实现了简体中文的本地化。本地化不仅仅是语言的翻译。不同文化有不同的习惯，例如姓名规则、时间和日期格式、书写方向、货币单位、标点符号等。要成功实现本地化，必须对当地文化有相当的了解。

### Locale

在软件系统中，`Locale` 是实现本地化的方法，它定义了软件的本地化环境。Locale 中包含很多不同类别的本地化定义，针对不同地区和文化的使用习惯。Locale 在 ANSI C 中就有明确的定义，所以虽然不同操作系统中对 Locale 的实现不尽相同，但大体上仍是相通的。

通常，Locale 由 language code、country（territory）code 和 optional codeset 组成：
```
language[_territory][.codeset]
```
例如：zh_CN.UTF-8。其中，zh 表示中文，CN 表示中国大陆，zh_CN 表示简体中文，zh_TW 表示繁体中文，zh_HK 表示香港地区繁体中文，zh_SG 表示新加坡简体中文。language code 来自于 ISO 639 定义，territory code 来自于 ISO 3166。

很多开发语言按同样的规则支持 Locale。例如，Java 中使用 Locale 类来定义区域设置。在 Linux 中，我们一般使用 LANG 环境变量来设置区域环境。

### Language Tag

"zh-CN"的写法被称为 Language Tag，全名为 **IETF BCP 47 language tag**。这是一种定义语言的“Code”，虽然看上去与 Locale 类似，但却不是一回事儿。Language Tag 是万维网时代的产物，通常用于 HTTP、HTML、XML 中。

Language Tag 由一个或多个 subtag 组成：
```
language-script-region-variant
```
language subtag 一般是两个字母的语言代码，来自于 ISO 639 的定义。

script subtag 这里的 script 是字体/文字的意思，由4个字母组成，第1个大写，其余的小写，来自于 ISO 15924。例如 Latn 表示拉丁文，Hans 表示简体中文，Hant 表示繁体中文。script subtag 通常是可以省略的。

region subtag 由两个大写字母或3个数字组成。两个大写字母来自于 ISO 3166，通常表示国界内的区域，例如“AT”表示奥地利。3个数字的定义来自于 UN M.49，表示跨国界的区域，如“015”表示北非。

variant subtag 表示语言或字体的某个变体，可以包括大写字母、小写字母和数字。如果以字母开头则至少5个字符长，如果以数字开头则至少4个字符长。例如“pinyin”。

从上面的定义看，不同的 subtag 可以通过字符类型或长度区分出来，省略任何一个部分都可以被识别出来，例如 "zh-Latn-pinyin" 中省略了 region。

### 总结

由此可见，在实现国际化时，如果是系统级别的语言设置（或者说是区域设置），使用 `locale=zh_CN` 的形式较好。如果是 HTTP/HTML/XML 中，或者是一段文本内容需要定义语言，使用 `lang=zh-CN` 的形式较好。

但是，从 SEO 的角度考虑，使用 `https://xxx.com/zh` 这样的形式是最好的。