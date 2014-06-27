const NS_SCRAPBOOK = "http://amb.vis.ne.jp/mozilla/scrapbook-rdf#";
Components.utils.import("resource://scrapbook-modules/common.jsm");

var sbDataSource = {

	_firstInit : true,
	_flushTimer : null,
	_dataObj : null,
	_dataFile : null,
	_prefs : {},

	get data()
	{
		if (!this._dataObj) this._init();
		return this._dataObj;
	},

	_init : function(aQuietWarning)
	{
		if (this._firstInit) {
			this._firstInit = false;
			var obs = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
			obs.addObserver(this, "quit-application", false);
		}
		try {
			this._dataFile = sbCommonUtils.getScrapBookDir();
			this._dataFile.append("scrapbook.rdf");
			if ( !this._dataFile.exists() )
			{
				var iDS = Components.classes["@mozilla.org/rdf/datasource;1?name=xml-datasource"].createInstance(Components.interfaces.nsIRDFDataSource);
				sbCommonUtils.RDFCU.MakeSeq(iDS, sbCommonUtils.RDF.GetResource("urn:scrapbook:root"));
				var iFileUrl = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService).newFileURI(this._dataFile);
				iDS.QueryInterface(Components.interfaces.nsIRDFRemoteDataSource).FlushTo(iFileUrl.spec);
			}
			var fileURL = sbCommonUtils.IO.newFileURI(this._dataFile).spec;
			this._dataObj = sbCommonUtils.RDF.GetDataSourceBlocking(fileURL);
			// record these prefs for change check
			this._prefs["data.default"] = sbCommonUtils.getPref("data.default", true);
			this._prefs["data.path"] = sbCommonUtils.getPref("data.path", "");
			this._prefs["multibook.enabled"] = sbCommonUtils.getPref("multibook.enabled", false);
		}
		catch(ex) {
			if ( !aQuietWarning ) sbCommonUtils.alert(sbCommonUtils.lang("scrapbook", "ERR_FAIL_INIT_DATASOURCE", [ex]));
		}
	},

	_uninit : function()
	{
		if (this._flushTimer) this.flush();
		sbCommonUtils.RDF.UnregisterDataSource(this._dataObj);
		this._dataObj = null;
		this._dataFile = null;
	},

	// when data source change (mostly due to changing pref)
	checkRefresh : function(aNoCheck)
	{
		if (!aNoCheck) {
			if ( this._prefs["data.default"] === sbCommonUtils.getPref("data.default", true) &&
				this._prefs["data.path"] === sbCommonUtils.getPref("data.path", "") &&
				this._prefs["multibook.enabled"] === sbCommonUtils.getPref("multibook.enabled", false)
			) return;
		}
		this._uninit();
		this._init();
		sbCommonUtils.refreshGlobal();
	},

	backup : function()
	{
		var bDir = sbCommonUtils.getScrapBookDir();
		bDir.append("backup");
		if ( !bDir.exists() ) bDir.create(bDir.DIRECTORY_TYPE, parseInt("0700", 8));
		var bFileName = "scrapbook_" + sbCommonUtils.getTimeStamp().substring(0,8) + ".rdf";
		try {
			this._dataFile.copyTo(bDir, bFileName);
			setTimeout(function(){ sbDataSource.cleanUpBackups(bDir); }, 1000);
		} catch(ex) {
		}
	},

	cleanUpBackups : function(bDir)
	{
		var max = 5;
		var today = (new Date()).getTime();
		var dirEnum = bDir.directoryEntries;
		while ( dirEnum.hasMoreElements() )
		{
			var entry = dirEnum.getNext().QueryInterface(Components.interfaces.nsILocalFile);
			if ( !entry.leafName.match(/^scrapbook_(\d{4})(\d{2})(\d{2})\.rdf$/) ) continue;
			var lifeTime = (new Date(parseInt(RegExp.$1, 10), parseInt(RegExp.$2, 10) - 1, parseInt(RegExp.$3, 10))).getTime();
			lifeTime = Math.round((today - lifeTime) / (1000 * 60 * 60 * 24));
			if ( lifeTime > 30 && --max >= 0 )
			{
				entry.remove(false);
			}
		}
	},

	flush : function()
	{
		this._dataObj.QueryInterface(Components.interfaces.nsIRDFRemoteDataSource).Flush();
		if (this._flushTimer) {
			this._flushTimer.cancel();
			this._flushTimer = null;
		}
	},

	_flushWithDelay : function()
	{
		if (this._flushTimer) return;
		this._flushTimer = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);
		// this.observe is called when time's up
		this._flushTimer.init(this, 10000, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
	},

	observe : function(aSubject, aTopic, aData)
	{
		switch (aTopic) {
			case "timer-callback": 
				this.flush();
				break;
			case "quit-application": 
				this._uninit();
				break;
			default: 
		}
	},

	unregister : function()
	{
		sbCommonUtils.RDF.UnregisterDataSource(this._dataObj);
	},



	sanitize : function(aVal)
	{
		if ( !aVal ) return "";
		return aVal.replace(/[\x00-\x1F\x7F]/g, " ");
	},

	validateURI : function(aURI)
	{
		if ( aURI == "urn:scrapbook:root" || aURI == "urn:scrapbook:search" || aURI.match(/^urn:scrapbook:item\d{14}$/) ) {
			return true;
		} else {
			return false;
		}
	},

	addItem : function(aSBitem, aParName, aIdx)
	{
		if ( !this.validateURI("urn:scrapbook:item" + aSBitem.id) ) return;
		aSBitem.title   = this.sanitize(aSBitem.title);
		aSBitem.comment = this.sanitize(aSBitem.comment);
		aSBitem.icon    = this.sanitize(aSBitem.icon);
		aSBitem.source  = this.sanitize(aSBitem.source);
		try {
			var cont = this.getContainer(aParName, false);
			if ( !cont )
			{
				cont = this.getContainer("urn:scrapbook:root", false);
				aIdx = 0;
			}
			var newRes = sbCommonUtils.RDF.GetResource("urn:scrapbook:item" + aSBitem.id);
			this._dataObj.Assert(newRes, sbCommonUtils.RDF.GetResource(NS_SCRAPBOOK + "id"),      sbCommonUtils.RDF.GetLiteral(aSBitem.id),      true);
			this._dataObj.Assert(newRes, sbCommonUtils.RDF.GetResource(NS_SCRAPBOOK + "type"),    sbCommonUtils.RDF.GetLiteral(aSBitem.type),    true);
			this._dataObj.Assert(newRes, sbCommonUtils.RDF.GetResource(NS_SCRAPBOOK + "title"),   sbCommonUtils.RDF.GetLiteral(aSBitem.title),   true);
			this._dataObj.Assert(newRes, sbCommonUtils.RDF.GetResource(NS_SCRAPBOOK + "chars"),   sbCommonUtils.RDF.GetLiteral(aSBitem.chars),   true);
			this._dataObj.Assert(newRes, sbCommonUtils.RDF.GetResource(NS_SCRAPBOOK + "comment"), sbCommonUtils.RDF.GetLiteral(aSBitem.comment), true);
			this._dataObj.Assert(newRes, sbCommonUtils.RDF.GetResource(NS_SCRAPBOOK + "icon"),    sbCommonUtils.RDF.GetLiteral(aSBitem.icon),    true);
			this._dataObj.Assert(newRes, sbCommonUtils.RDF.GetResource(NS_SCRAPBOOK + "source"),  sbCommonUtils.RDF.GetLiteral(aSBitem.source),  true);
			if (aSBitem.type == "separator") {
				const RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
				const NC_NS  = "http://home.netscape.com/NC-rdf#";
				this._dataObj.Assert(
					newRes,
					sbCommonUtils.RDF.GetResource(RDF_NS + "type"),
					sbCommonUtils.RDF.GetResource(NC_NS + "BookmarkSeparator"),
					true
				);
			}
			if ( sbCommonUtils.getPref("tree.unshift", false) )
			{
				if ( aIdx == 0 || aIdx == -1 ) aIdx = 1;
			}
			if ( 0 < aIdx && aIdx < cont.GetCount() ) {
				cont.InsertElementAt(newRes, aIdx, true);
			} else {
				cont.AppendElement(newRes);
			}
			this._flushWithDelay();
			return newRes;
		} catch(ex) {
			sbCommonUtils.alert(sbCommonUtils.lang("scrapbook", "ERR_FAIL_ADD_RESOURCE", [ex]));
			return false;
		}
	},

	moveItem : function(curRes, curPar, tarPar, tarRelIdx)
	{
		try {
			sbCommonUtils.RDFC.Init(this._dataObj, curPar);
			sbCommonUtils.RDFC.RemoveElement(curRes, true);
		} catch(ex) {
			sbCommonUtils.alert(sbCommonUtils.lang("scrapbook", "ERR_FAIL_ADD_RESOURCE1", [ex]));
			return;
		}
		if ( sbCommonUtils.getPref("tree.unshift", false) )
		{
			if ( tarRelIdx == 0 || tarRelIdx == -1 ) tarRelIdx = 1;
		}
		try {
			sbCommonUtils.RDFC.Init(this._dataObj, tarPar);
			if ( tarRelIdx > 0 ) {
				sbCommonUtils.RDFC.InsertElementAt(curRes, tarRelIdx, true);
			} else {
				sbCommonUtils.RDFC.AppendElement(curRes);
			}
		} catch(ex) {
			sbCommonUtils.alert(sbCommonUtils.lang("scrapbook", "ERR_FAIL_ADD_RESOURCE2", [ex]));
			sbCommonUtils.RDFC.Init(this._dataObj, sbCommonUtils.RDF.GetResource("urn:scrapbook:root"));
			sbCommonUtils.RDFC.AppendElement(curRes, true);
		}
		this._flushWithDelay();
	},

	createEmptySeq : function(aResName)
	{
		if ( !this.validateURI(aResName) ) return;
		sbCommonUtils.RDFCU.MakeSeq(this._dataObj, sbCommonUtils.RDF.GetResource(aResName));
		this._flushWithDelay();
	},

	deleteItemDescending : function(aRes, aParRes)
	{
		sbCommonUtils.RDFC.Init(this._dataObj, aParRes);
		sbCommonUtils.RDFC.RemoveElement(aRes, true);
		var addIDs = [];
		var rmIDs = [];
		var depth = 0;
		do {
			addIDs = this.cleanUpIsolation();
			rmIDs = rmIDs.concat(addIDs);
		}
		while( addIDs.length > 0 && ++depth < 100 );
		this._flushWithDelay();
		return rmIDs;
	},

	cleanUpIsolation : function()
	{
		var rmIDs = [];
		try {
			var resEnum = this._dataObj.GetAllResources();
			while ( resEnum.hasMoreElements() )
			{
				var aRes = resEnum.getNext().QueryInterface(Components.interfaces.nsIRDFResource);
				if ( aRes.Value != "urn:scrapbook:root" && aRes.Value != "urn:scrapbook:search" && !this._dataObj.ArcLabelsIn(aRes).hasMoreElements() )
				{
					rmIDs.push( this.removeResource(aRes) );
				}
			}
		} catch(ex) {
			sbCommonUtils.alert(sbCommonUtils.lang("scrapbook", "ERR_FAIL_CLEAN_DATASOURCE", [ex]));
		}
		return rmIDs;
	},

	removeResource : function(aRes)
	{
		var names = this._dataObj.ArcLabelsOut(aRes);
		var rmID = this.getProperty(aRes, "id");
		while ( names.hasMoreElements() )
		{
			try {
				var name  = names.getNext().QueryInterface(Components.interfaces.nsIRDFResource);
				var value = this._dataObj.GetTarget(aRes, name, true);
				this._dataObj.Unassert(aRes, name, value);
			} catch(ex) {
			}
		}
		this._flushWithDelay();
		return rmID;
	},



	getContainer : function(aResURI, force)
	{
		var cont = Components.classes['@mozilla.org/rdf/container;1'].createInstance(Components.interfaces.nsIRDFContainer);
		try {
			cont.Init(this._dataObj, sbCommonUtils.RDF.GetResource(aResURI));
		} catch(ex) {
			if ( force ) {
				if ( !this.validateURI(aResURI) ) return null;
				return sbCommonUtils.RDFCU.MakeSeq(this._dataObj, sbCommonUtils.RDF.GetResource(aResURI));
			} else {
				return null;
			}
		}
		return cont;
	},

	clearContainer : function(ccResURI)
	{
		var ccCont = this.getContainer(ccResURI, true);
		var ccCount = ccCont.GetCount();
		for ( var ccI=ccCount; ccI>0; ccI-- )
		{
			ccCont.RemoveElementAt(ccI, true);
		}
		this._flushWithDelay();
	},

	removeFromContainer : function(aResURI, aRes)
	{
		var cont = this.getContainer(aResURI, true);
		if ( cont ) cont.RemoveElement(aRes, true);
		this._flushWithDelay();
	},



	getProperty : function(aRes, aProp)
	{
		if ( aRes.Value == "urn:scrapbook:root" ) return "";
		try {
			var retVal = this._dataObj.GetTarget(aRes, sbCommonUtils.RDF.GetResource(NS_SCRAPBOOK + aProp), true);
			return retVal.QueryInterface(Components.interfaces.nsIRDFLiteral).Value;
		} catch(ex) {
			return "";
		}
	},

	setProperty : function(aRes, aProp, newVal)
	{
		newVal = this.sanitize(newVal);
		aProp = sbCommonUtils.RDF.GetResource(NS_SCRAPBOOK + aProp);
		try {
			var oldVal = this._dataObj.GetTarget(aRes, aProp, true);
			oldVal = oldVal.QueryInterface(Components.interfaces.nsIRDFLiteral);
			newVal = sbCommonUtils.RDF.GetLiteral(newVal);
			this._dataObj.Change(aRes, aProp, oldVal, newVal);
			this._flushWithDelay();
		} catch(ex) {
		}
	},

	getURL : function(aRes)
	{
		var id = aRes.Value.substring(18);
		switch ( this.getProperty(aRes, "type") )
		{
			case "folder"   : return "chrome://scrapbook/content/view.xul?id=" + id; break;
			case "note"     : return "chrome://scrapbook/content/note.xul?id=" + id; break;
			case "bookmark" : return this.getProperty(aRes, "source"); break;
			default         : return sbCommonUtils.getBaseHref(this._dataObj.URI) + "data/" + id + "/index.html";
		}
	},

	exists : function(aRes)
	{
		if ( typeof(aRes) == "string" )
		{
			aRes = sbCommonUtils.RDF.GetResource("urn:scrapbook:item" + aRes);
		}
		return this._dataObj.ArcLabelsOut(aRes).hasMoreElements();
	},

	isContainer : function(aRes)
	{
		return sbCommonUtils.RDFCU.IsContainer(this._dataObj, aRes);
	},

	identify : function(aID)
	{
		var i = 0;
		while ( this.exists(aID) && i < 100 )
		{
			aID = sbCommonUtils.getTimeStamp(--i);
		}
		return aID;
	},

	getRelativeIndex : function(aParRes, aRes)
	{
		return sbCommonUtils.RDFCU.indexOf(this._dataObj, aParRes, aRes);
	},

	flattenResources : function(aContRes, aRule, aRecursive)
	{
		var resList = [];
		if ( aRule != 2 ) resList.push(aContRes);
		sbCommonUtils.RDFC.Init(this._dataObj, aContRes);
		var resEnum = sbCommonUtils.RDFC.GetElements();
		while ( resEnum.hasMoreElements() )
		{
			var res = resEnum.getNext().QueryInterface(Components.interfaces.nsIRDFResource);
			if ( this.isContainer(res) ) {
				if ( aRecursive )
					resList = resList.concat(this.flattenResources(res, aRule, aRecursive));
				else
					if ( aRule != 2 ) resList.push(res);
			} else {
				if ( aRule != 1 ) resList.push(res);
			}
		}
		return resList;
	},

	findParentResource : function(aRes)
	{
		var resEnum = this._dataObj.GetAllResources();
		while ( resEnum.hasMoreElements() )
		{
			var res = resEnum.getNext().QueryInterface(Components.interfaces.nsIRDFResource);
			if ( !this.isContainer(res) ) continue;
			if ( res.Value == "urn:scrapbook:search" ) continue;
			if ( sbCommonUtils.RDFCU.indexOf(this._dataObj, res, aRes) != -1 ) return res;
		}
		return null;
	},

};

var EXPORTED_SYMBOLS = ["sbDataSource"];