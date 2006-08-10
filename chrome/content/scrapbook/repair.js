
var sbRepair = {

	get WIZARD() { return document.getElementById("sbRepairWizard"); },
	get TREE()   { return document.getElementById("sbRepairTree"); },

	treeItems : [],

	initStartPage : function()
	{
		var nextPage;
		switch ( document.getElementById("sbRepairRadioGroup").selectedIndex )
		{
			case 0 : nextPage = "sbRepairRDF1"; break;
			case 1 : nextPage = "sbRepairFavicons"; break;
		}
		if ( nextPage ) this.WIZARD.currentPage.next = nextPage;
		this.WIZARD.canAdvance = nextPage ? true : false;
	},

	initRestoreRDF : function()
	{
		this.treeItems = [];
		var backupDir = sbCommonUtils.getScrapBookDir();
		backupDir.append("backup");
		if ( !backupDir.exists() )
		{
			alert("No backup files found.");
			return;
		}
		var fileEnum = backupDir.directoryEntries;
		while ( fileEnum.hasMoreElements() )
		{
			var fileObj  = fileEnum.getNext().QueryInterface(Components.interfaces.nsIFile);
			var fileName = fileObj.leafName;
			var isMatch  = fileName.match(/^scrapbook_\d{8}\.rdf$/);
			if ( isMatch ) this.treeItems.push([fileName, sbTrader.formatMilliSeconds(fileObj.lastModifiedTime), fileObj.fileSize]);
		}
		var colIDs = [
			"sbRepairTreecolFile",
			"sbRepairTreecolTime",
			"sbRepairTreecolSize",
		];
		this.TREE.view = new sbCustomTreeView(colIDs, this.treeItems);
	},

	execRestoreRDF : function()
	{
		if ( this.TREE.currentIndex < 0 ) { this.WIZARD.rewind(); return; }
		var fileName = this.treeItems[this.TREE.currentIndex][0];
		if ( !fileName ) { this.WIZARD.rewind(); return; }
		var bFile = sbCommonUtils.getScrapBookDir();
		bFile.append("backup");
		bFile.append(fileName);
		if ( !bFile.exists() || !bFile.isFile() ) { this.WIZARD.rewind(); return; }
		this.WIZARD.canRewind = false;
		var aFile = sbCommonUtils.getScrapBookDir();
		aFile.append("scrapbook.rdf");
		try {
			var bDir = sbCommonUtils.getScrapBookDir();
			bDir.append("backup");
			aFile.copyTo(bDir, "scrapbook_" + sbCommonUtils.getTimeStamp().substring(0,8) + ".rdf");
		} catch(ex) {
		}
		try {
			aFile.remove(false);
			var aDir = sbCommonUtils.getScrapBookDir();
			bFile.copyTo(aDir, "scrapbook.rdf");
		} catch(ex) {
			document.getElementById("sbRepairRDF2Text").value = "ERROR: " + ex;
			return;
		}
		document.getElementById("sbRepairRDF2Text").value = document.getElementById("sbRepairRDFCompleted").value;
		sbDataSource.init();
		sbCommonUtils.RDF.UnregisterDataSource(sbDataSource.data);
		sbMultiBookService.refreshGlobal();
	},

	restoreFavicons : function()
	{
		this.WIZARD.canRewind = false;
		sbDataSource.init();
		var shouldFlush = false;
		var i = 0;
		var resEnum = sbDataSource.data.GetAllResources();
		while ( resEnum.hasMoreElements() )
		{
			var res  = resEnum.getNext().QueryInterface(Components.interfaces.nsIRDFResource);
			var id   = sbDataSource.getProperty(res, "id");
			var icon = sbDataSource.getProperty(res, "icon");
			if ( res.Value == "urn:scrapbook:root" || res.Value == "urn:scrapbook:search" ) continue;
			if ( ++i % 10 == 0 ) document.getElementById("sbRepairFaviconsTextbox").value = res.Value;
			if ( icon.match(/(\d{14}\/.*$)/) )
			{
				var newIcon = "resource://scrapbook/data/" + RegExp.$1;
				if ( icon != newIcon )
				{
					sbDataSource.setProperty(res, "icon", newIcon);
					shouldFlush = true;
				}
			}
		}
		document.getElementById("sbRepairFaviconsTextbox").value = document.getElementById("sbRepairFaviconsCompleted").value;
		if ( shouldFlush ) { sbDataSource.flush(); window.opener.reload(); }
	},

};


