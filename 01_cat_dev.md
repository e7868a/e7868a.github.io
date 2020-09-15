---
layout: page
title: 软件开发
---
软件开发
==========

{% if site.posts != empty %}
<ul class="tags-box">
{% for cat in site.categories %}
{% if cat[0] == "软件开发" %}
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
