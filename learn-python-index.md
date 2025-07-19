---
layout: default
title: Python 学习教程
permalink: /learn-python/
---

# 零基础使用 Python 开发魔方机器人

---

Youtube 上有一个非常酷的使用 Lego SPIKE Prime 搭建的魔方机器人，视频如下：
<div style="text-align: center; margin: 20px 0;">
<iframe width="560" height="315" src="https://www.youtube.com/embed/4PlHQtcdYII?si=LrCj0mpEG16xhH5U" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
</div>

原作者把搭建方法和代码都开放在了 https://mindcuber.com/ 这个网站上，并提供了下载，当然，代码是用 Python 写的。

我的两个女儿都是乐高迷，她们只在学校学过一些 Mind+ 课程，她们已经可以自己用图形化编程，完成一些 SPIKE Prime 上的课程，我老早就答应要教她们编程，但是迟迟没有开始。我希望通过这个魔方机器人，教会她们 Python 编程。

我希望这是一个能让无基础的初中生就能看懂的课程，长度会控制在8-10个章节。大概的大纲如下：
- 介绍 Python 的基础知识，数据类型，
- 使用 Python 在 SPIKE Prime 上进行传感器，电机等设备的基础控制，
- 实现基于用例库的魔方机器人代码，
- 实现基于搜索算法的魔方机器人代码，迈出人工智能的第 1 步。

## 课程大纲

---

{% assign sorted_lessons = site.learn-python | sort: 'order' %}
{% for lesson in sorted_lessons %}
<div class="lesson-item">
  <h3><a href="{{ lesson.url }}">第{{ lesson.order }}课：{{ lesson.title }}</a></h3>
  <p class="lesson-date">发布日期：{{ lesson.date | date: "%Y年%m月%d日" }}</p>
  {% if lesson.excerpt %}
  <p class="lesson-excerpt">{{ lesson.excerpt | strip_html | truncatewords: 30 }}</p>
  {% endif %}
</div>
{% endfor %}



<style>
.lesson-item {
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
  background-color: #f6f8fa;
}

.lesson-item h3 {
  margin-top: 0;
  margin-bottom: 8px;
}

.lesson-item h3 a {
  color: #0366d6;
  text-decoration: none;
}

.lesson-item h3 a:hover {
  text-decoration: underline;
}

.lesson-date {
  color: #586069;
  font-size: 14px;
  margin-bottom: 8px;
}

.lesson-excerpt {
  color: #24292e;
  line-height: 1.5;
}

</style>