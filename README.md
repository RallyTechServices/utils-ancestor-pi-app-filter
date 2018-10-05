# @agile-central-technical-services/utils-ancestor-pi-app-filter

An app plugin that adds a ancestor portfolio item filter to the app. The plugin will:
* add an app setting that controls what portfolio item level to filter (e.g. Feature, Epic, etc)
* If the setting is enabled, search the app for a container with the id of
`Utils.AncestorPiAppFilter.RENDER_AREA_ID` and add a portfolio item picker.
* Dispatch a `select` event when the selected portfolio item is changed.
* Make the current portfolio item available as a Rally.data.wsapi.Filter relative to a given type.
(e.g. An Epic ancestor for a HierarchicalRequirement becomes `PortfolioItem.Parent = /portfolioitem/epic/1234`)
* If the given type doesn't have the selected portfolio item type as an ancestor, a null filter
is returned `(ObjectID = 0)`.
* To ensure the filter is fully initialized, it returns a promise of a filter that resolves once it's
the control has an intial value.

![Screenshot](https://github.com/RallyTechServices/utils-ancestor-pi-app-filter/raw/master/screenshot1.png)
![Screenshot](https://github.com/RallyTechServices/utils-ancestor-pi-app-filter/raw/master/screenshot2.png)

## Installation
1. Install using npm (or yarn) `npm install '@agile-central-technical-services/utils-ancestor-pi-app-filter' -D`
2. Add the file to the `javascript` section of `config.json`
    ```
     "javascript": [
        "node_modules/@agile-central-technical-services/utils-ancestor-pi-app-filter/index.js",
        ...
    ```

## Example usage

```
Ext.define("custom-grid-with-deep-export", {
    extend: 'Rally.app.App',
    items: [{
        id: Utils.AncestorPiAppFilter.RENDER_AREA_ID,
        xtype: 'container'
    }
    
    plugins: [{
        ptype: 'UtilsAncestorPiAppFilter',
        pluginId: 'ancestorFilterPlugin',
        // Set to false to prevent the '-- None --' selection option if your app can't support
        // querying by a null ancestor (e.g. Lookback _ItemHierarchy)
        allowNoEntry: true
    }],
    
    launch: function() {
        // Update the counters when the filters change
        var ancestorFilterPlugin = this.getPlugin('ancestorFilterPlugin');
        ancestorFilterPlugin.on('select', function() {
            this._runApp();
        }, this);
    },
    
    loadData: function() {
        ...
        var ancestorFilterPlugin = this.getPlugin('ancestorFilterPlugin');
        var promise = ancestorFilterPlugin.getFilterForType(artifactType).then({
                scope: this,
                success: function(ancestorFilter) {
                    if (ancestorFilter) {
                        filters = filters.and(ancestorFilter);
                    }
                    return this._loadRealData(artifactType, filters || [], id)
                }
            });
    }
```

## Developer Notes
To Update
1. `npm version patch` - This will update the package.json to a new version and create a git tag (e.g. `v1.0.1`). It will also run the `postversion` script
to push the changes and tag to GitHub.
2. `npm publish --access public` - This will publish the new version to npmjs.org
3. Create the new release in [`utils_file-utils/releases'](https://github.com/RallyTechServices/utils_file-utils/releases)

