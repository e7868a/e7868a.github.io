---
layout: page
title: 读书笔记
---
读书笔记
==========

{% if site.posts != empty %}
<ul class="tags-box">
{% for cat in site.categories %}
{% if cat[0] == "大数据开发" %}
{% for post in cat[1] %}
<time datetime="{{ post.date | date:"%Y-%m-%d" }}">{{ post.date | date:"%Y-%m-%d" }}</time> &raquo;
<a href="{{ site.baseurl }}{{ post.url }}" title="{{ post.title }}">{{ post.title }}</a><br />
{% endfor %}
{% endif %}
{% endfor %}
{% else %}
<span>No posts</span>
{% endif %}
</ul>
