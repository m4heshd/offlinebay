$(document).ready(function(){

    /* Search bar animations
    ----------------------------*/
    $(".top-search__input").on("focus", function() {
        $(".top-search").addClass("top-search--focused");
    });
    $(".top-search").on("click", ".top-search__reset", function() {
        $(".top-search").removeClass("top-search--focused"),
            $(".top-search__input").val("")
    });
    $(".top-search__input").on("blur", function() {
        var a = $(this).val();
        !a.length > 0 && $(".top-search").removeClass("top-search--focused")
    });

    /* Menu dropdown animations
    ----------------------------*/
    $('.dropdown').on('show.bs.dropdown', function() {
        $(this).find('.dropdown-menu').first().stop(true, true).css({ opacity: 1, transition: 'opacity 0.2s' }).slideDown(200);
    });
    $('.dropdown').on('hide.bs.dropdown', function() {
        $(this).find('.dropdown-menu').first().stop(true, true).css({ opacity: 0, transition: 'opacity 0.2s' }).slideUp(200);
    });

    /* Data table functions
    ----------------------------*/
    var tbl = $("#tbl-main").bootgrid({
        //Override default icon classes
        css: {
            icon: 'table-bootgrid__icon zmdi',
            iconSearch: 'zmdi-search',
            iconColumns: 'zmdi-view-column',
            iconDown: 'zmdi-sort-amount-desc',
            iconRefresh: 'zmdi-refresh',
            iconUp: 'zmdi-sort-amount-asc',
            dropDownMenu: 'dropdown form-group--select',
            search: 'table-bootgrid__search',
            actions: 'table-bootgrid__actions',
            header: 'table-bootgrid__header',
            footer: 'table-bootgrid__footer',
            dropDownItem: 'table-bootgrid__label',
            table: 'table table-bootgrid',
            pagination: 'pagination table-bootgrid__pagination',
            selectCell: 'd-none'
        },

        //Override default module markups
        templates: {
            actionDropDown: "<span class=\"{{css.dropDownMenu}}\">" + "<a href='' data-toggle=\"dropdown\">{{ctx.content}}</a><ul class=\"{{css.dropDownMenuItems}}\" role=\"menu\"></ul></span>",
            search: "<div class=\"{{css.search}} form-group\"><span class=\"{{css.icon}} {{css.iconSearch}}\"></span><input type=\"text\" class=\"{{css.searchField}}\" placeholder=\"{{lbl.search}}\" /><i class='form-group__bar'></i></div>",
            header: "<div id=\"{{ctx.id}}\" class=\"{{css.header}}\"><p class=\"{{css.search}}\"></p><p class=\"{{css.actions}}\"></p></div>",
            actionDropDownCheckboxItem: "<li><div class='tabe-bootgrid__checkbox checkbox checkbox--dark'><label class=\"{{css.dropDownItem}}\"><input name=\"{{ctx.name}}\" type=\"checkbox\" value=\"1\" class=\"{{css.dropDownItemCheckbox}}\" {{ctx.checked}} /> {{ctx.label}}<i class='input-helper'></i></label></div></li>",
            footer: "<div id=\"{{ctx.id}}\" class=\"{{css.footer}}\"><div class=\"row\"><div class=\"col-sm-6\"><p class=\"{{css.pagination}}\"></p></div><div class=\"col-sm-6 table-bootgrid__showing hidden-xs\"><p class=\"{{css.infos}}\"></p></div></div></div>",
            select: "<div class='checkbox'><label><input name=\"select\" type=\"{{ctx.type}}\" class=\"{{css.selectBox}}\" value=\"{{ctx.value}}\" {{ctx.checked}} /><i class='input-helper'></i></label></div>"
        },
        navigation: 0,
        selection: true,
        multiSelect: false,
        rowSelect: true,
        keepSelection: true
    });
});