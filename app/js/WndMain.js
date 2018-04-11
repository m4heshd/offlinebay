$(document).ready(function(){

    /* Search bar animations
    ----------------------------*/
    $(".top-search__input").on("focus", function() {
        $(".top-search").addClass("top-search--focused");
    }).on("blur", function() {
        let a = $(this).val();
        !a.length > 0 && $(".top-search").removeClass("top-search--focused");
    });
    $(".top-search").on("click", ".top-search__reset", function() {
        $(".top-search").removeClass("top-search--focused");
            $(".top-search__input").val("");
    });

    /* Menu dropdown animations
    ----------------------------*/
    $('.dropdown').on('show.bs.dropdown', function() {
        $(this).find('.dropdown-menu').first().stop(true, true).css({ opacity: 1, transition: 'opacity 0.2s' }).slideDown(200);
    }).on('hide.bs.dropdown', function() {
        $(this).find('.dropdown-menu').first().stop(true, true).css({ opacity: 0, transition: 'opacity 0.2s' }).slideUp(200);
    });

    /* Data table functions
    ----------------------------*/
    $("#tblMain tbody tr").on('click', function () {
        if (!$(this).hasClass('active')) {
            $('#tblMain .active').removeClass('active');
            $(this).addClass('active');
        }
    });
    let $table = $('#tblMain');
    $table.floatThead({
        zIndex: 1
    });

});