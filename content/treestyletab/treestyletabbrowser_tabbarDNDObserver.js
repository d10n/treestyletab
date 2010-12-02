function TreeStyleTabBrowserTabbarDNDObserver(aOwner) 
{
	this.init(aOwner);
}

TreeStyleTabBrowserTabbarDNDObserver.prototype = {
	
	get SSS() 
	{
		if (this._SSS === void(0)) {
			if ('@mozilla.org/content/style-sheet-service;1' in Components.classes) {
				this._SSS = Components.classes['@mozilla.org/content/style-sheet-service;1'].getService(Components.interfaces.nsIStyleSheetService);
			}
			if (!this._SSS)
				this._SSS = null;
		}
		return this._SSS;
	},
 
	readyToStartTabbarDrag : function TSTTabbarDND_readyToStartTabbarDrag() 
	{
		var sheet = this.mOwner.makeURIFromSpec('chrome://treestyletab/content/hide-embed.css');
		if (!this.SSS.sheetRegistered(sheet, this.SSS.AGENT_SHEET))
			this.SSS.loadAndRegisterSheet(sheet, this.SSS.AGENT_SHEET);
	},
 
	readyToEndTabbarDrag : function TSTTabbarDND_readyToEndTabbarDrag() 
	{
		var sheet = this.mOwner.makeURIFromSpec('chrome://treestyletab/content/hide-embed.css');
		if (this.SSS.sheetRegistered(sheet, this.SSS.AGENT_SHEET))
			this.SSS.unregisterSheet(sheet, this.SSS.AGENT_SHEET);
	},
 
	canDragTabbar : function TSTTabbarDND_canDragTabbar(aEvent) 
	{
		var sv = this.mOwner;

		if (
			sv.evaluateXPath(
				'ancestor-or-self::*[contains(" scrollbar popup menupopup panel tooltip ", concat(" ", local-name(), " "))]',
				aEvent.originalTarget,
				XPathResult.BOOLEAN_TYPE
			).booleanValue ||
			sv.isToolbarCustomizing
			)
			return false;

		var tab = sv.getTabFromEvent(aEvent);
		var tabbar = sv.getTabbarFromEvent(aEvent);
		var canDrag = (
				(tab ? aEvent.shiftKey : tabbar ) &&
				(
					aEvent.shiftKey ||
					sv.mTabBrowser.getAttribute(sv.kFIXED) != 'true'
				)
			);

		if (canDrag && !aEvent.shiftKey) {
			let insensitiveArea = sv.getTreePref('tabbar.fixed.insensitiveArea');
			let box = tabbar.boxObject;
			switch (sv.currentTabbarPosition)
			{
				case 'right':
					if (aEvent.screenX < box.screenX + insensitiveArea)
						canDrag = false;
					break;

				case 'left':
					if (aEvent.screenX > box.screenX + box.width - insensitiveArea)
						canDrag = false;
					break;

				default:
				case 'top':
					if (aEvent.screenY > box.screenY + box.height - insensitiveArea)
						canDrag = false;
					break;

				case 'bottom':
					if (aEvent.screenY < box.screenY + insensitiveArea)
						canDrag = false;
					break;
			}
		}

		return canDrag;
	},
 
	canDrop : function TSTTabbarDND_canDrop(aEvent) 
	{
		var sv = this.mOwner;
		var tooltip = sv.tabStrip.firstChild;
		if (tooltip &&
			tooltip.localName == 'tooltip' &&
			tooltip.popupBoxObject.popupState != 'closed')
			tooltip.hidePopup();

		var dropAction = this.getDropAction(aEvent);
		if ('dataTransfer' in aEvent) {
			var dt = aEvent.dataTransfer;
			if (dropAction.action & sv.kACTION_NEWTAB) {
				dt.effectAllowed = dt.dropEffect = (
					!dropAction.source ? 'link' :
					sv.isCopyAction(aEvent) ? 'copy' :
					'move'
				);
			}
		}
		return dropAction.canDrop;
	},
	
	canDropTab : function TSTTabbarDND_canDropTab(aEvent) 
	{
try{
		var sv = this.mOwner;
		var b  = sv.mTabBrowser;

		var session = sv.currentDragSession;
		var node = session.sourceNode;
		var tab = sv.getTabFromChild(node);
		if (!node ||
			!tab ||
			tab.parentNode != b.mTabContainer)
			return true;

		tab = sv.getTabFromEvent(aEvent);
		if (sv.isCollapsed(tab))
			return false;

		var info = this.getDropAction(aEvent, session);
		return info.canDrop;
}
catch(e) {
		dump('TreeStyleTabService::canDrop\n'+e+'\n');
		return false;
}
	},
  
	getDropAction : function TSTTabbarDND_getDropAction(aEvent, aDragSession) 
	{
		var sv = this.mOwner;
		var b  = sv.mTabBrowser;

		if (!aDragSession)
			aDragSession = sv.currentDragSession;

		var tab = aDragSession ? sv.getTabFromChild(aDragSession.sourceNode) : null ;
		sv.ensureTabInitialized(tab);

		var info = this.getDropActionInternal(aEvent, tab);
		info.canDrop = true;
		info.source = tab;
		if (tab) {
			var isCopy = sv.isCopyAction(aEvent);
			if (isCopy && 'duplicateTab' in b) {
				info.action |= sv.kACTION_DUPLICATE;
			}
			if (
				!isCopy &&
				sv.getTabBrowserFromChild(tab) != b &&
				(
					('duplicateTab' in b) ||
					('swapBrowsersAndCloseOther' in b)
				)
				) {
				info.action |= sv.kACTION_IMPORT;
			}

			if (info.action & sv.kACTIONS_FOR_DESTINATION) {
				if (info.action & sv.kACTION_MOVE) info.action ^= sv.kACTION_MOVE;
				if (info.action & sv.kACTION_STAY) info.action ^= sv.kACTION_STAY;
			}

			if (info.action & sv.kACTION_ATTACH) {
				if (info.parent == tab) {
					info.canDrop = false;
				}
				else {
					var orig = tab;
					tab  = info.target;
					while (tab = sv.getParentTab(tab))
					{
						if (tab != orig) continue;
						info.canDrop = false;
						break;
					}
				}
			}
		}
		return info;
	},
	
	getDropActionInternal : function TSTTabbarDND_getDropActionInternal(aEvent, aSourceTab) 
	{
		var sv = this.mOwner;
		var b  = sv.mTabBrowser;

		var tab        = aEvent.target;
		var tabs       = sv.getTabsArray(b);
		var firstTab   = sv.getFirstNormalTab(b);
		var lastTabIndex = tabs.length -1;
		var isInverted = sv.isVertical ? false : window.getComputedStyle(b.parentNode, null).direction == 'rtl';
		var info       = {
				target       : null,
				position     : null,
				action       : null,
				parent       : null,
				insertBefore : null,
				event        : aEvent
			};

		var isTabMoveFromOtherWindow = aSourceTab && aSourceTab.ownerDocument != document;
		var isNewTabAction = !aSourceTab || aSourceTab.ownerDocument != document;

		if (tab.localName != 'tab') {
			var action = isTabMoveFromOtherWindow ? sv.kACTION_STAY : (sv.kACTION_MOVE | sv.kACTION_PART) ;
			if (isNewTabAction) action |= sv.kACTION_NEWTAB;
			if (aEvent[sv.positionProp] < firstTab.boxObject[sv.positionProp]) {
				info.target   = info.parent = info.insertBefore = firstTab;
				info.position = isInverted ? sv.kDROP_AFTER : sv.kDROP_BEFORE ;
				info.action   = action;
				return info;
			}
			else if (aEvent[sv.positionProp] > tabs[lastTabIndex].boxObject[sv.positionProp] + tabs[lastTabIndex].boxObject[sv.sizeProp]) {
				info.target   = info.parent = tabs[lastTabIndex];
				info.position = isInverted ? sv.kDROP_BEFORE : sv.kDROP_AFTER ;
				info.action   = action;
				return info;
			}
			else {
				let index = b.getNewIndex ?
								b.getNewIndex(aEvent) :
								b.tabContainer._getDropIndex(aEvent) ;
				info.target = tabs[Math.min(index, lastTabIndex)];
			}
		}
		else {
			sv.ensureTabInitialized(tab);
			info.target = tab;
		}

		var positionProp = sv.isVertical && tab.getAttribute('pinned') == 'true' ? sv.invertedPositionProp : sv.positionProp ;
		var sizeProp = sv.isVertical && tab.getAttribute('pinned') == 'true' ? sv.invertedSizeProp : sv.sizeProp ;
		var boxPos  = tab.boxObject[positionProp];
		var boxUnit = Math.round(tab.boxObject[sizeProp] / 3);
		if (aEvent[positionProp] < boxPos + boxUnit) {
			info.position = isInverted ? sv.kDROP_AFTER : sv.kDROP_BEFORE ;
		}
		else if (aEvent[positionProp] > boxPos + boxUnit + boxUnit) {
			info.position = isInverted ? sv.kDROP_BEFORE : sv.kDROP_AFTER ;
		}
		else {
			info.position = sv.kDROP_ON;
		}

		switch (info.position)
		{
			case sv.kDROP_ON:
				info.action       = sv.kACTION_STAY | sv.kACTION_ATTACH;
				info.parent       = tab;
				var visible = sv.getNextVisibleTab(tab);
				info.insertBefore = sv.getTreePref('insertNewChildAt') == sv.kINSERT_FISRT ?
						(sv.getFirstChildTab(tab) || visible) :
						(sv.getNextSiblingTab(tab) || sv.getNextTab(sv.getLastDescendantTab(tab)) || visible);
				break;

			case sv.kDROP_BEFORE:
/*
	[TARGET  ] ��part from parent, and move

	  [      ]
	[TARGET  ] ��attach to the parent of the target, and move

	[        ]
	[TARGET  ] ��attach to the parent of the target, and move

	[        ]
	  [TARGET] ��attach to the parent of the target (previous tab), and move
*/
				var prevTab = sv.getPreviousVisibleTab(tab);
				if (!prevTab) {
					info.action       = sv.kACTION_MOVE | sv.kACTION_PART;
					info.insertBefore = firstTab;
				}
				else {
					var prevLevel   = Number(prevTab.getAttribute(sv.kNEST));
					var targetNest = Number(tab.getAttribute(sv.kNEST));
					info.parent       = (prevLevel < targetNest) ? prevTab : sv.getParentTab(tab) ;
					info.action       = sv.kACTION_MOVE | (info.parent ? sv.kACTION_ATTACH : sv.kACTION_PART );
					info.insertBefore = tab;
				}
				break;

			case sv.kDROP_AFTER:
/*
	[TARGET  ] ��if the target has a parent, attach to it and and move

	  [TARGET] ��attach to the parent of the target, and move
	[        ]

	[TARGET  ] ��attach to the parent of the target, and move
	[        ]

	[TARGET  ] ��attach to the target, and move
	  [      ]
*/
				var nextTab = sv.getNextVisibleTab(tab);
				if (!nextTab) {
					info.action = sv.kACTION_MOVE | sv.kACTION_ATTACH;
					info.parent = sv.getParentTab(tab);
				}
				else {
					var targetNest = Number(tab.getAttribute(sv.kNEST));
					var nextLevel   = Number(nextTab.getAttribute(sv.kNEST));
					info.parent       = (targetNest < nextLevel) ? tab : sv.getParentTab(tab) ;
					info.action       = sv.kACTION_MOVE | (info.parent ? sv.kACTION_ATTACH : sv.kACTION_PART );
					info.insertBefore = nextTab;
/*
	[TARGET   ] ��attach dragged tab to the parent of the target as its next sibling
	  [DRAGGED]
*/
					if (aSourceTab == nextTab && sv.getDescendantTabs(info.parent).length == 1) {
						info.action = sv.kACTION_MOVE | sv.kACTION_ATTACH;
						info.parent = sv.getParentTab(tab);
						info.insertBefore = sv.getNextTab(nextTab);
					}
				}
				break;
		}

		if (isNewTabAction) action |= sv.kACTION_NEWTAB;

		return info;
	},
  
	performDrop : function TSTTabbarDND_performDrop(aInfo, aDraggedTab) 
	{
		var sv = this.mOwner;
		var b  = sv.mTabBrowser;

		var tabsInfo = this.getDraggedTabsInfoFromOneTab(aInfo, aDraggedTab);
		if (!tabsInfo.draggedTab) return false;

		aDraggedTab = tabsInfo.draggedTab;
		var draggedTabs = tabsInfo.draggedTabs;
		var draggedRoots = tabsInfo.draggedRoots;


		var targetBrowser = b;
		var tabs = sv.getTabsArray(targetBrowser);

		var sourceWindow = aDraggedTab.ownerDocument.defaultView;
		var sourceBrowser = sv.getTabBrowserFromChild(aDraggedTab);

		var draggedWholeTree = [].concat(draggedRoots);
		draggedRoots.forEach(function(aRoot) {
			draggedWholeTree = draggedWholeTree.concat(sv.getDescendantTabs(aRoot));
		}, this);
		while (aInfo.insertBefore && draggedWholeTree.indexOf(aInfo.insertBefore) > -1)
		{
			aInfo.insertBefore = sv.getNextTab(aInfo.insertBefore);
		}

		if (aInfo.action & sv.kACTIONS_FOR_SOURCE) {
			if (aInfo.action & sv.kACTION_PART) {
				this.partTabsOnDrop(draggedRoots);
			}
			else if (aInfo.action & sv.kACTION_ATTACH) {
				this.attachTabsOnDrop(draggedRoots, aInfo.parent);
			}
			else {
				return false;
			}

			if ( // if this move will cause no change...
				sourceBrowser == targetBrowser &&
				sourceBrowser.treeStyleTab.getNextVisibleTab(draggedTabs[draggedTabs.length-1]) == aInfo.insertBefore
				) {
				// then, do nothing
				return true;
			}
		}


		// prevent Multiple Tab Handler feature
		targetBrowser.duplicatingSelectedTabs = true;
		targetBrowser.movingSelectedTabs = true;


		var newRoots = [];
		var shouldClose = (
				aInfo.action & sv.kACTION_IMPORT &&
				sv.getAllTabsArray(sourceBrowser).length == draggedTabs.length
			);
		var oldTabs = [];
		var newTabs = [];
		var treeStructure = draggedTabs.map(function(aTab) {
				var parent = sourceBrowser.treeStyleTab.getParentTab(aTab);
				return parent ? draggedTabs.indexOf(parent) : -1 ;
			});

		var parentTabsArray = draggedTabs.map(function(aTab) {
				return (aInfo.action & sv.kACTIONS_FOR_DESTINATION) ?
					sourceBrowser.treeStyleTab.getParentTab(aTab) : null ;
			}, this);

		// Firefox fails to "move" collapsed tabs. So, expand them first
		// and collapse them after they are moved.
		var collapseExpandState = [];
		if (aInfo.action & sv.kACTION_IMPORT &&
			'swapBrowsersAndCloseOther' in targetBrowser) {
			draggedWholeTree.forEach(function(aTab) {
				collapseExpandState.push(sv.getTabValue(aTab, sv.kSUBTREE_COLLAPSED) == 'true');
				sv.collapseExpandSubtree(aTab, false, true);
				sv.collapseExpandTab(aTab, false, true);
			}, sv);
		}

		var lastTabIndex = tabs.length -1;
		draggedTabs.forEach(function(aTab, aIndex) {
			var tab = aTab;
			if (aInfo.action & sv.kACTIONS_FOR_DESTINATION) {
				var parent = parentTabsArray[aIndex];
				if (tabsInfo.isMultipleMove && 'MultipleTabService' in sourceWindow)
					sourceWindow.MultipleTabService.setSelection(aTab, false);
				if (aInfo.action & sv.kACTION_IMPORT &&
					'swapBrowsersAndCloseOther' in targetBrowser) {
					tab = targetBrowser.addTab();
					tab.linkedBrowser.stop();
					tab.linkedBrowser.docShell;
					targetBrowser.swapBrowsersAndCloseOther(tab, aTab);
					targetBrowser.setTabTitle(tab);
				}
				else {
					tab = targetBrowser.duplicateTab(aTab);
					sv.deleteTabValue(tab, sv.kCHILDREN);
					sv.deleteTabValue(tab, sv.kPARENT);
					if (aInfo.action & sv.kACTION_IMPORT)
						oldTabs.push(aTab);
				}
				newTabs.push(tab);
				if (tabsInfo.isMultipleMove && 'MultipleTabService' in window)
					MultipleTabService.setSelection(tab, true);
				if (!parent || draggedTabs.indexOf(parent) < 0)
					newRoots.push(tab);
				lastTabIndex++;
			}

			var newIndex = aInfo.insertBefore ? aInfo.insertBefore._tPos : lastTabIndex ;
			if (aInfo.insertBefore && newIndex > tab._tPos) newIndex--;

			sv.internallyTabMovingCount++;
			targetBrowser.moveTabTo(tab, newIndex);
			sv.collapseExpandTab(tab, false, true);
			sv.internallyTabMovingCount--;

		}, this);

		// close imported tabs from the source browser
		oldTabs.forEach(function(aTab) {
			sourceBrowser.removeTab(aTab, { animate : true });
		});
		if (shouldClose)
			this.closeOwner(sourceBrowser);

		// restore tree structure for newly opened tabs
		newTabs.forEach(function(aTab, aIndex) {
			var index = treeStructure[aIndex];
			if (index < 0) return;
			sv.attachTabTo(aTab, newTabs[index]);
		}, sv);
		newTabs.reverse();
		collapseExpandState.reverse();
		collapseExpandState.forEach(function(aCollapsed, aIndex) {
			sv.collapseExpandSubtree(newTabs[aIndex], aCollapsed, true);
		}, sv);

		if (aInfo.action & sv.kACTIONS_FOR_DESTINATION &&
			aInfo.action & sv.kACTION_ATTACH)
			this.attachTabsOnDrop(newRoots, aInfo.parent);

		// Multiple Tab Handler
		targetBrowser.movingSelectedTabs = false;
		targetBrowser.duplicatingSelectedTabs = false;

		return true;
	},
	
	getDraggedTabsInfoFromOneTab : function TSTTabbarDND_getDraggedTabsInfoFromOneTab(aInfo, aTab) 
	{
		var sv = this.mOwner;
		var b  = sv.mTabBrowser;

		aTab = sv.getTabFromChild(aTab);
		if (!aTab)
			return {
				draggedTab     : null,
				draggedTabs    : [],
				draggedRoots   : [],
				isMultipleMove : false
			};

		var targetBrowser = b;
		var tabs = sv.getTabsArray(targetBrowser);

		var sourceWindow = aTab.ownerDocument.defaultView;
		var sourceBrowser = sv.getTabBrowserFromChild(aTab);

		var draggedTabs = window['piro.sakura.ne.jp'].tabsDragUtils.getSelectedTabs(aInfo.event || sourceBrowser);
		var draggedRoots = [aTab];
		var isMultipleMove = false;

		if (draggedTabs.length > 1) {
			isMultipleMove = true;
			if (!(aInfo.action & sv.kACTIONS_FOR_DESTINATION)) {
				draggedRoots = [];
				draggedTabs.forEach(function(aTab) {
					var parent = aTab,
						current;
					do {
						current = parent;
						parent = sourceBrowser.treeStyleTab.getParentTab(parent)
						if (parent && draggedTabs.indexOf(parent) > -1) continue;
						draggedRoots.push(current);
						return;
					}
					while (parent);
				}, this);
			}
		}
		else if (aInfo.action & sv.kACTIONS_FOR_DESTINATION) {
			draggedTabs = [aTab].concat(sourceBrowser.treeStyleTab.getDescendantTabs(aTab));
		}

		return {
			draggedTab     : aTab,
			draggedTabs    : draggedTabs,
			draggedRoots   : draggedRoots,
			isMultipleMove : isMultipleMove
		};
	},
 
	attachTabsOnDrop : function TSTTabbarDND_attachTabsOnDrop(aTabs, aParent) 
	{
		var sv = this.mOwner;
		var b  = sv.mTabBrowser;

		b.movingSelectedTabs = true; // Multiple Tab Handler
		aTabs.forEach(function(aTab) {
			if (!aTab.parentNode) return; // ignore removed tabs
			if (aParent)
				sv.attachTabTo(aTab, aParent);
			else
				sv.partTab(aTab);
			sv.collapseExpandTab(aTab, false);
		}, sv);
		b.movingSelectedTabs = false; // Multiple Tab Handler
	},
 
	partTabsOnDrop : function TSTTabbarDND_partTabsOnDrop(aTabs) 
	{
		var sv = this.mOwner;
		var b  = sv.mTabBrowser;

		b.movingSelectedTabs = true; // Multiple Tab Handler
		aTabs.forEach(function(aTab) {
			if (!aTab.parentNode) return; // ignore removed tabs
			sv.partTab(aTab);
			sv.collapseExpandTab(aTab, false);
		}, sv);
		b.movingSelectedTabs = false; // Multiple Tab Handler
	},
 
	closeOwner : function TSTTabbarDND_closeOwner(aTabOwner) 
	{
		var w = aTabOwner.ownerDocument.defaultView;
		if (!w) return;
		if ('SplitBrowser' in w) {
			if ('getSubBrowserFromChild' in w.SplitBrowser) {
				var subbrowser = w.SplitBrowser.getSubBrowserFromChild(aTabOwner);
				if (subbrowser) {
					subbrowser.close();
					return;
				}
			}
			if (w.SplitBrowser.browsers.length) return;
		}
		w.close();
	},
  
	clearDropPosition : function TSTTabbarDND_clearDropPosition() 
	{
		var sv = this.mOwner;
		var b  = sv.mTabBrowser;
		var xpathResult = sv.evaluateXPath(
				'child::xul:tab[@'+sv.kDROP_POSITION+']',
				b.mTabContainer
			);
		for (var i = 0, maxi = xpathResult.snapshotLength; i < maxi; i++)
		{
			xpathResult.snapshotItem(i).removeAttribute(sv.kDROP_POSITION);
		}
	},
 
	isDraggingAllTabs : function TSTTabbarDND_isDraggingAllTabs(aTab, aTabs) 
	{
		var sv = this.mOwner;
		var b  = sv.mTabBrowser;

		var actionInfo = {
				action : sv.kACTIONS_FOR_DESTINATION | sv.kACTION_IMPORT
			};
		var tabsInfo = this.getDraggedTabsInfoFromOneTab(actionInfo, aTab);
		return tabsInfo.draggedTabs.length == (aTabs || sv.getAllTabsArray(b)).length;
	},
 
	isDraggingAllCurrentTabs : function TSTTabbarDND_isDraggingAllCurrentTabs(aTab) 
	{
		return this.isDraggingAllTabs(aTab, this.getTabsArray(this.mOwner.mTabBrowser));
	},
 
	handleEvent : function TSTTabbarDND_handleEvent(aEvent) 
	{
		switch (aEvent.type)
		{
			case 'dragstart': return this.onDragStart(aEvent);
			case 'dragenter': return this.onDragEnter(aEvent);
			case 'dragleave': return this.onDragLeave(aEvent);
			case 'dragend':   return this.onDragEnd(aEvent);
			case 'dragover':  return this.onDragOver(aEvent);
			case 'drop':      return this.onDrop(aEvent);
		}
	},
	
	onDragStart : function TSTTabbarDND_onDragStart(aEvent) 
	{
		if (this.canDragTabbar(aEvent))
			return this.onTabbarDragStart(aEvent);

		var tab = this.mOwner.getTabFromEvent(aEvent);
		if (tab)
			return this.onTabDragStart(aEvent, tab);
	},
	
	onTabDragStart : function TSTTabbarDND_onTabDragStart(aEvent, aTab) 
	{
		var sv = this.mOwner;
		var actionInfo = {
				action : sv.kACTIONS_FOR_DESTINATION | sv.kACTION_MOVE,
				event  : aEvent
			};
		var tabsInfo = this.getDraggedTabsInfoFromOneTab(actionInfo, aTab);
		if (tabsInfo.draggedTabs.length > 1)
			window['piro.sakura.ne.jp'].tabsDragUtils.startTabsDrag(aEvent, tabsInfo.draggedTabs);
	},
 
	onTabbarDragStart : function TSTTabbarDND_onTabbarDragStart(aEvent) 
	{
		var sv = this.mOwner;
		var dt = aEvent.dataTransfer;
		dt.mozSetDataAt(
			sv.kDRAG_TYPE_TABBAR,
			aEvent.shiftKey ?
				sv.kTABBAR_MOVE_FORCE :
				sv.kTABBAR_MOVE_NORMAL,
			0
		);
		dt.mozCursor = 'move';
//		var tabbar = sv.mTabBrowser.mTabContainer;
//		var box = tabbar.boxObject;
//		dt.setDragImage(
//			tabbar,
//			aEvent.screenX - box.screenX,
//			aEvent.screenY - box.screenY
//		);
		// no feedback image, because it's annoying...
		dt.setDragImage(new Image(), 0, 0);
		aEvent.stopPropagation();
		this.readyToStartTabbarDrag();
	},
  
	onDragEnter : function TSTTabbarDND_onDragEnter(aEvent) 
	{
		var sv = this.mOwner;

		var dt = aEvent.dataTransfer;
		if (!this.canDrop(aEvent)) {
			dt.effectAllowed = dt.dropEffect = 'none';
			return;
		}

		var tab = aEvent.target;
		if (tab.localName != 'tab' ||
			!sv.getTreePref('autoExpand.enabled'))
			return;

		window.clearTimeout(this.mAutoExpandTimer);

		var sourceNode = dt.getData(sv.kDRAG_TYPE_TABBAR+'-node');
		if (aEvent.target == sourceNode)
			return;

		this.mAutoExpandTimer = window.setTimeout(
			function(aTarget) {
				let tab = sv.getTabById(aTarget);
				if (tab &&
					sv.shouldTabAutoExpanded(tab) &&
					tab.getAttribute(sv.kDROP_POSITION) == 'self') {
					if (sv.getTreePref('autoExpand.intelligently')) {
						sv.collapseExpandTreesIntelligentlyFor(tab);
					}
					else {
						this.mAutoExpandedTabs.push(aTarget);
						sv.collapseExpandSubtree(tab, false);
					}
				}
			},
			sv.getTreePref('autoExpand.delay'),
			tab.getAttribute(sv.kID)
		);

		tab = null;
	},
 
	onDragLeave : function TSTTabbarDND_onDragLeave(aEvent) 
	{
		var sv = this.mOwner;
		var b  = sv.mTabBrowser;

		var tabbarFromEvent = sv.getTabbarFromChild(aEvent.relatedTarget);
		if (!tabbarFromEvent)
			this.clearDropPosition();

		window.clearTimeout(this.mAutoExpandTimer);
		this.mAutoExpandTimer = null;
	},
 
	onDragEnd : function TSTTabbarDND_onDragEnd(aEvent) 
	{
		var sv = this.mOwner;
		var dt = aEvent.dataTransfer;
		if (dt.getData(sv.kDRAG_TYPE_TABBAR))
			this.onTabbarDragEnd(aEvent);
		else
			this.onTabDragEnd(aEvent);
	},
	
	onTabDragEnd : function TSTTabbarDND_onTabDragEnd(aEvent) 
	{
		var sv = this.mOwner;
		var b  = sv.mTabBrowser;

		var tabbar = b.mTabContainer;
		var strip = sv.tabStrip;
		var dt = aEvent.dataTransfer;

		this.clearDropPosition();

		if (dt.mozUserCancelled || dt.dropEffect != 'none')
			return;

		// prevent handling of this event by the default handler
		aEvent.stopPropagation();

		var eX = aEvent.screenX;
		var eY = aEvent.screenY;
		var x, y, w, h;

		// ignore drop on the toolbox
		x = window.screenX;
		y = window.screenY;
		w = window.outerWidth;
		h = document.getElementById('navigator-toolbox').boxObject.height;
		if (eX > x && eX < x + w && eY > y && eY < y + h)
			return;

		// ignore drop near the tab bar
		var box = strip.boxObject;
		var ignoreArea = Math.max(16, parseInt(sv.getFirstNormalTab(b).boxObject.height / 2));
		x = box.screenX - (sv.isVertical ? ignoreArea : 0 );
		y = box.screenY - ignoreArea;
		w = box.width + (sv.isVertical ? ignoreArea + ignoreArea : 0 );
		h = box.height + ignoreArea + ignoreArea;
		if (eX > x && eX < x + w && eY > y && eY < y + h)
			return;

		var draggedTab = dt.mozGetDataAt(TAB_DROP_TYPE, 0);
		if (this.isDraggingAllCurrentTabs(draggedTab))
			return;

		b.replaceTabWithWindow(draggedTab);
	},
 
	onTabbarDragEnd : function TSTTabbarDND_onTabbarDragEnd(aEvent) 
	{
		window.setTimeout(function(aSelf) {
			aSelf.readyToEndTabbarDrag();
			aSelf.mOwner.removeTabbrowserAttribute(aSelf.mOwner.kDROP_POSITION);
		}, 10, this);
		aEvent.stopPropagation();
		aEvent.preventDefault();
	},
  
	onDragOver : function TSTTabbarDND_onDragOver(aEvent) 
	{
		if (this.onTabDragOver(aEvent)) {
			aEvent.stopPropagation();
			aEvent.preventDefault(); // this is required to override default dragover actions!
		}
	},
	
	onTabDragOver : function TSTTabbarDND_onTabDragOver(aEvent) 
	{
try{
		var sv = this.mOwner;
		var b  = sv.mTabBrowser;

		var session = sv.currentDragSession;
		if (
			sv.isToolbarCustomizing ||
			!sv.getTabFromChild(session.sourceNode)
			)
			return false;

		sv.autoScroll.processAutoScroll(aEvent);

		var info = this.getDropAction(aEvent, session);

		var observer = b;
		if (b.tabContainer && b.tabContainer._setEffectAllowedForDataTransfer) // for Firefox 4.0
			observer = b.tabContainer;

		// auto-switch for staying on tabs (Firefox 3.5 or later)
		if (
			info.position == sv.kDROP_ON &&
			info.target &&
			!info.target.selected &&
			(
				('mDragTime' in observer && 'mDragOverDelay' in observer) || // Firefox 3.6
				('_dragTime' in observer && '_dragOverDelay' in observer) // Firefox 4.0 or later
			)
			) {
			let time = observer.mDragTime || observer._dragTime || 0;
			let delay = observer.mDragOverDelay || observer._dragOverDelay || 0;
			let effects = observer._setEffectAllowedForDataTransfer(aEvent);
			if (effects == 'link') {
				let now = Date.now();
				if (!time) {
					time = now;
					if ('mDragTime' in observer)
						observer.mDragTime = time;
					else
						observer._dragTime = time;
				}
				if (now >= time + delay)
					aTabBrowser.selectedTab = info.target;
			}
		}

		if (!info.target || info.target != sv.evaluateXPath(
				'child::xul:tab[@'+sv.kDROP_POSITION+']',
				b.mTabContainer,
				XPathResult.FIRST_ORDERED_NODE_TYPE
			).singleNodeValue)
			this.clearDropPosition();

		if (
			!info.canDrop ||
			observer._setEffectAllowedForDataTransfer(aEvent) == 'none'
			) {
			aEvent.dataTransfer.effectAllowed = "none";
			return true;
		}

		info.target.setAttribute(
			sv.kDROP_POSITION,
			info.position == sv.kDROP_BEFORE ? 'before' :
			info.position == sv.kDROP_AFTER ? 'after' :
			'self'
		);
		var indicator = b.mTabDropIndicatorBar || b.tabContainer._tabDropIndicator;
		indicator.setAttribute('dragging', (info.position == sv.kDROP_ON) ? 'false' : 'true' );
		return (info.position == sv.kDROP_ON || sv.currentTabbarPosition != 'top')
}
catch(e) {
	dump('TreeStyleTabService::onDragOver\n'+e+'\n');
}
	},
  
	onDrop : function TSTTabbarDND_onDrop(aEvent) 
	{
		this.onTabDrop(aEvent);

		var sv = this.mOwner;
		if (this.mAutoExpandedTabs.length) {
			if (sv.getTreePref('autoExpand.collapseFinally')) {
				this.mAutoExpandedTabs.forEach(function(aTarget) {
					this.collapseExpandSubtree(this.getTabById(aTarget), true, true);
				}, sv);
			}
			this.mAutoExpandedTabs = [];
		}
	},
	
	onTabDrop : function TSTService_onTabDrop(aEvent) 
	{
		var sv = this.mOwner;
		var b  = sv.mTabBrowser;

		var tabbar = b.mTabContainer;
		var dt = aEvent.dataTransfer;

		this.clearDropPosition();

		if (tabbar._tabDropIndicator) // for Firefox 4 or later
			tabbar._tabDropIndicator.collapsed = true;

		var session = sv.currentDragSession;
		var dropActionInfo = this.getDropAction(aEvent, session);

		var draggedTab;
		if (dt.dropEffect != 'link') {
			draggedTab = dt.mozGetDataAt(TAB_DROP_TYPE, 0);
			if (!draggedTab) {
				aEvent.stopPropagation();
				return;
			}
		}

		if (draggedTab && this.performDrop(dropActionInfo, draggedTab)) {
			aEvent.stopPropagation();
			return;
		}

		// duplicating of tabs
		if (
			draggedTab &&
			(
				dt.dropEffect == 'copy' ||
				sv.getTabBrowserFromChild(draggedTab) != b
			) &&
			dropActionInfo.position == sv.kDROP_ON
			) {
			var beforeTabs = Array.slice(b.mTabContainer.childNodes);
			window.setTimeout(function() {
				var newTabs = Array.slice(b.mTabContainer.childNodes).filter(function(aTab) {
						return beforeTabs.indexOf(aTab) < 0;
					});
				if (newTabs.length)
					sv.attachTabTo(newTabs[0], dropActionInfo.target);
			}, 0);
			return;
		}

		// dropping of urls
		if (!draggedTab) {
			aEvent.stopPropagation();

			let url = this.retrieveURLFromDataTransfer(dt);

			if (!url || !url.length || url.indexOf(' ', 0) != -1 || /^\s*(javascript|data):/.test(url))
				return;

			let (sourceDoc = session ? session.sourceDocument : null) {
				if (sourceDoc &&
					sourceDoc.documentURI.indexOf('chrome://') < 0) {
					let sourceURI = sourceDoc.documentURI;
					let nsIScriptSecurityManager = Components.interfaces.nsIScriptSecurityManager;
					let secMan = Components.classes['@mozilla.org/scriptsecuritymanager;1']
									.getService(nsIScriptSecurityManager);
					try {
						secMan.checkLoadURIStr(sourceDoc.documentURI, url, nsIScriptSecurityManager.STANDARD);
					}
					catch(e) {
						aEvent.stopPropagation();
						throw 'Drop of ' + url + ' denied.';
					}
				}
			}

			let bgLoad = sv.getPref('browser.tabs.loadInBackground');
			if (aEvent.shiftKey) bgLoad = !bgLoad;

			let tab = sv.getTabFromEvent(aEvent);
			if (!tab || dt.dropEffect == 'copy') {
				this.performDrop(dropActionInfo, b.loadOneTab(getShortcutOrURI(url), { inBackground: bgLoad }));
			}
			else {
				let locked = (
						tab.getAttribute('locked') == 'true' || // Tab Mix Plus and others
						tab.getAttribute('isPageLocked') == 'true' // Super Tab Mode
					);
				let loadDroppedLinkToNewChildTab = dropActionInfo.position != sv.kDROP_ON || locked;
				if (!loadDroppedLinkToNewChildTab &&
					dropActionInfo.position == sv.kDROP_ON)
					loadDroppedLinkToNewChildTab = sv.dropLinksOnTabBehavior() == sv.kDROPLINK_NEWTAB;

				try {
					if (loadDroppedLinkToNewChildTab || locked) {
						this.performDrop(dropActionInfo, b.loadOneTab(getShortcutOrURI(url), { inBackground: bgLoad }));
					}
					else {
						tab.linkedBrowser.loadURI(getShortcutOrURI(url));
						if (!bgLoad)
							b.selectedTab = tab;
					}
				}
				catch(e) {
				}
			}
		}
	},
	
	retrieveURLFromDataTransfer : function TSTService_retrieveURLFromDataTransfer(aDataTransfer) 
	{
		let url;
		let types = ['text/x-moz-url', 'text/uri-list', 'text/plain', 'application/x-moz-file'];
		for (let i = 0; i < types.length; i++) {
			let dataType = types[i];
			let isURLList = dataType == 'text/uri-list';
			let urlData = aDataTransfer.mozGetDataAt(isURLList ? 'URL' : dataType , 0);
			if (urlData) {
				url = this.retrieveURLFromData(urlData, isURLList ? 'text/plain' : dataType);
				break;
			}
		}
		return url;
	},
	retrieveURLFromData : function TSTService_retrieveURLFromData(aData, aType)
	{
		switch (aType)
		{
			case 'text/unicode':
			case 'text/plain':
			case 'text/x-moz-text-internal':
				return aData.replace(/^\s+|\s+$/g, '');

			case 'text/x-moz-url':
				return ((aData instanceof Components.interfaces.nsISupportsString) ? aData.toString() : aData)
							.split('\n')[0];

			case 'application/x-moz-file':
				let fileHandler = this.IOService.getProtocolHandler('file')
									.QueryInterface(Components.interfaces.nsIFileProtocolHandler);
				return fileHandler.getURLSpecFromFile(aData);
		}
		return null;
	},
    
	init : function TSTTabbarDND_init(aOwner) 
	{
		this.mOwner = aOwner;
		this.mAutoExpandTimer = null;
		this.mAutoExpandedTabs = [];

		var strip = this.mOwner.tabStrip;
		strip.addEventListener('dragstart', this, true);
		strip.addEventListener('dragover',  this, true);
		strip.addEventListener('dragenter', this, false);
		strip.addEventListener('dragleave', this, false);
		strip.addEventListener('dragend',   this, false);
		strip.addEventListener('drop',      this, true);
	},
 
	destroy : function TSTTabbarDND_destroy() 
	{
		var strip = this.mOwner.tabStrip;
		strip.removeEventListener('dragstart', this, true);
		strip.removeEventListener('dragover',  this, true);
		strip.removeEventListener('dragenter', this, false);
		strip.removeEventListener('dragleave', this, false);
		strip.removeEventListener('dragend',   this, false);
		strip.removeEventListener('drop',      this, true);

		delete this.mOwner;
	}
 
}; 
  
