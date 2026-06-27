var normal = document.getElementById("nav-menu");
var reverse = document.getElementById("nav-menu-left");

var icon = normal !== null ? normal : reverse;

// Toggle the "menu-open" % "menu-opn-left" classes
function toggle() {
	  var navRight = document.getElementById("nav");
	  var navLeft = document.getElementById("nav-left");
	  var nav = navRight !== null ? navRight : navLeft;

	  var button = document.getElementById("menu");
	  var site = document.getElementById("wrap");
	  
	  if (nav.className == "menu-open" || nav.className == "menu-open-left") {
	  	  nav.className = "";
	  	  button.className = "";
	  	  site.className = "";
	  } else if (reverse !== null) {
	  	  nav.className += "menu-open-left";
	  	  button.className += "btn-close";
	  	  site.className += "fixed";
	  } else {
	  	  nav.className += "menu-open";
	  	  button.className += "btn-close";
	  	  site.className += "fixed";
	    }
	}

// Ensures backward compatibility with IE old versions
function menuClick() {
	if (document.addEventListener && icon !== null) {
		icon.addEventListener('click', toggle);
	} else if (document.attachEvent && icon !== null) {
		icon.attachEvent('onclick', toggle);
	} else {
		return;
	}
}

menuClick();

function initPostToc() {
	var layout = document.querySelector("[data-post-layout]");
	if (layout === null) {
		return;
	}

	var toc = layout.querySelector("[data-post-toc]");
	var tocNav = layout.querySelector("[data-post-toc-nav]");
	var toggleButton = layout.querySelector("[data-post-toc-toggle]");
	var headings = document.querySelectorAll(".content h3, .content h4");

	if (toc === null || tocNav === null || toggleButton === null || headings.length === 0) {
		layout.className = layout.className.replace("post-toc-pending", "");
		layout.className += " post-toc-empty";
		return;
	}

	var storageKey = "postTocOpen";
	var headingList = Array.prototype.slice.call(headings);
	var usedIds = {};
	var list = document.createElement("ol");
	list.className = "post-toc-list";

	function getStoredTocOpen() {
		try {
			return window.localStorage.getItem(storageKey);
		} catch (error) {
			return null;
		}
	}

	function setStoredTocOpen(isOpen) {
		try {
			window.localStorage.setItem(storageKey, isOpen ? "true" : "false");
		} catch (error) {
			return;
		}
	}

	function defaultTocOpen() {
		if (window.matchMedia === undefined) {
			return true;
		}
		return window.matchMedia("(min-width: 1180px)").matches;
	}

	function uniqueHeadingId(heading, index) {
		if (heading.id !== "") {
			usedIds[heading.id] = true;
			return heading.id;
		}

		var text = heading.textContent || "";
		var base = text.trim().toLowerCase()
			.replace(/[^\u4e00-\u9fa5a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");

		if (base === "") {
			base = "section-" + (index + 1);
		}

		var id = base;
		var suffix = 2;
		while (usedIds[id] || (document.getElementById(id) !== null && document.getElementById(id) !== heading)) {
			id = base + "-" + suffix;
			suffix += 1;
		}

		usedIds[id] = true;
		heading.id = id;
		return id;
	}

	function setTocOpen(isOpen, persist) {
		if (isOpen) {
			layout.className = layout.className.replace(/\bpost-toc-hidden\b/g, "");
		} else if (layout.className.indexOf("post-toc-hidden") === -1) {
			layout.className += " post-toc-hidden";
		}

		toggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");

		if (persist) {
			setStoredTocOpen(isOpen);
		}
	}

	headingList.forEach(function(heading, index) {
		var id = uniqueHeadingId(heading, index);
		var item = document.createElement("li");
		var link = document.createElement("a");

		item.className = "post-toc-item post-toc-item-" + heading.tagName.toLowerCase();
		link.className = "post-toc-link";
		link.href = "#" + id;
		link.textContent = heading.textContent;
		link.title = heading.textContent;
		link.setAttribute("data-post-toc-target", id);

		link.addEventListener("click", function(event) {
			if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
				return;
			}

			event.preventDefault();

			var target = document.getElementById(id);
			if (target !== null) {
				target.scrollIntoView();
				setActiveTocItem(id);

				if (window.history !== undefined && window.history.replaceState !== undefined) {
					window.history.replaceState(null, "", link.getAttribute("href"));
				}
			}

			if (window.matchMedia !== undefined && window.matchMedia("(max-width: 1179px)").matches) {
				setTocOpen(false, true);
			}
		});

		item.appendChild(link);
		list.appendChild(item);
	});

	tocNav.appendChild(list);

	var links = Array.prototype.slice.call(tocNav.querySelectorAll(".post-toc-link"));

	function setActiveTocItem(activeId) {
		links.forEach(function(link) {
			var isActive = link.getAttribute("data-post-toc-target") === activeId;
			if (isActive) {
				link.className = "post-toc-link post-toc-link-active";
				link.setAttribute("aria-current", "true");
			} else {
				link.className = "post-toc-link";
				link.removeAttribute("aria-current");
			}
		});
	}

	function updateActiveTocItem() {
		var activeHeading = headingList[0];
		var threshold = 120;
		var pageBottom = window.pageYOffset + window.innerHeight >= document.documentElement.scrollHeight - 2;

		if (pageBottom) {
			activeHeading = headingList[headingList.length - 1];
		} else {
			headingList.forEach(function(heading) {
				if (heading.getBoundingClientRect().top <= threshold) {
					activeHeading = heading;
				}
			});
		}

		setActiveTocItem(activeHeading.id);
	}

	var ticking = false;
	function requestActiveTocUpdate() {
		if (ticking) {
			return;
		}
		ticking = true;
		window.requestAnimationFrame(function() {
			updateActiveTocItem();
			ticking = false;
		});
	}

	var storedOpen = getStoredTocOpen();
	setTocOpen(storedOpen === null ? defaultTocOpen() : storedOpen === "true", false);
	layout.className = layout.className.replace("post-toc-pending", "");

	toggleButton.addEventListener("click", function() {
		var isOpen = layout.className.indexOf("post-toc-hidden") !== -1;
		setTocOpen(isOpen, true);
	});

	if (window.matchMedia !== undefined) {
		var desktopQuery = window.matchMedia("(min-width: 1180px)");
		var handleViewportChange = function() {
			if (getStoredTocOpen() === null) {
				setTocOpen(defaultTocOpen(), false);
			}
			requestActiveTocUpdate();
		};

		if (desktopQuery.addEventListener !== undefined) {
			desktopQuery.addEventListener("change", handleViewportChange);
		} else if (desktopQuery.addListener !== undefined) {
			desktopQuery.addListener(handleViewportChange);
		}
	}

	window.addEventListener("scroll", requestActiveTocUpdate);
	window.addEventListener("resize", requestActiveTocUpdate);
	updateActiveTocItem();
}

initPostToc();
